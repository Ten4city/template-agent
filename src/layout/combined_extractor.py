#!/usr/bin/env python3
"""
Combined Layout + Control Extractor

Merges text layout extraction (PyMuPDF) with control detection (OpenCV)
to produce a unified JSON representation of document structure.

Usage:
    python combined_extractor.py <pdf_path> [--page N] [--output path.json] [--debug]
"""

import json
import argparse
import tempfile
from pathlib import Path

import fitz  # PyMuPDF

# Import our modules
from extract_layout import extract_pdf, classify_page_type, group_into_rows, classify_rows, detect_columns, group_consecutive_rows, apply_grid_to_row_group
from detect_controls import detect_all_controls


def assign_blocks_to_bands(blocks, row_bands, scale_factor):
    """
    Assign text blocks to visual row bands based on Y-center overlap.

    This makes visual rows authoritative - blocks are grouped by which
    visual band they fall into, not by their text Y-coordinates.

    Args:
        blocks: List of text blocks with bbox
        row_bands: List of visual bands [{"y0": int, "y1": int}, ...]
        scale_factor: Image scale relative to PDF coordinates

    Returns:
        List of rows, each with blocks assigned to that band
    """
    if not row_bands:
        return None  # Signal to use fallback

    rows = []

    for band in row_bands:
        # Convert band coordinates from image space to PDF space
        band_y0 = band["y0"] / scale_factor
        band_y1 = band["y1"] / scale_factor

        # Find blocks whose Y-center falls within this band
        band_blocks = []
        for block in blocks:
            block_y_center = (block["bbox"]["y0"] + block["bbox"]["y1"]) / 2
            if band_y0 <= block_y_center <= band_y1:
                band_blocks.append(block)

        if band_blocks:
            # Sort blocks by X position (left to right)
            band_blocks.sort(key=lambda b: b["bbox"]["x0"])

            rows.append({
                "blocks": band_blocks,
                "y_min": round(band_y0, 2),
                "y_max": round(band_y1, 2),
                "source": "visual_band",
            })

    return rows if rows else None


def render_page_to_image(pdf_path, page_num, dpi=300):
    """
    Render a PDF page to a temporary image file.

    Args:
        pdf_path: Path to PDF
        page_num: Page number (1-indexed)
        dpi: Resolution for rendering

    Returns:
        Path to temporary PNG file
    """
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]

    # Render at specified DPI
    zoom = dpi / 72  # 72 is default DPI
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)

    # Save to temp file
    temp_file = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    pix.save(temp_file.name)

    doc.close()
    return temp_file.name


def map_controls_to_blocks(controls, blocks, scale_factor):
    """
    Associate detected controls with nearby text blocks.

    Returns controls with associated block IDs and labels.
    """
    mapped_controls = []

    for control in controls:
        ctrl_bbox = control["bbox"]
        ctrl_cx = (ctrl_bbox["x0"] + ctrl_bbox["x1"]) / 2
        ctrl_cy = (ctrl_bbox["y0"] + ctrl_bbox["y1"]) / 2

        # Scale control bbox back to PDF coordinates
        pdf_x0 = ctrl_bbox["x0"] / scale_factor
        pdf_y0 = ctrl_bbox["y0"] / scale_factor
        pdf_x1 = ctrl_bbox["x1"] / scale_factor
        pdf_y1 = ctrl_bbox["y1"] / scale_factor

        # Find closest text block to the left or above
        best_block = None
        best_distance = float("inf")

        for block in blocks:
            block_bbox = block["bbox"]

            # Check if block is to the left of control (within same row)
            if (
                block_bbox["x1"] < pdf_x0 + 20
                and abs(block_bbox["y0"] - pdf_y0) < 15
            ):
                # Distance from block right edge to control left edge
                dist = pdf_x0 - block_bbox["x1"]
                if 0 < dist < best_distance:
                    best_distance = dist
                    best_block = block

        control_mapped = control.copy()
        control_mapped["pdf_bbox"] = {
            "x0": round(pdf_x0, 2),
            "y0": round(pdf_y0, 2),
            "x1": round(pdf_x1, 2),
            "y1": round(pdf_y1, 2),
        }

        if best_block:
            control_mapped["label_block_id"] = best_block["id"]
            control_mapped["label_text"] = best_block["text"]

        mapped_controls.append(control_mapped)

    return mapped_controls


def compute_control_features(control, scale_factor):
    """
    Compute generic features for a detected control.
    Don't classify - let the LLM interpret based on context.
    """
    bbox = control["bbox"]
    w = bbox["x1"] - bbox["x0"]
    h = bbox["y1"] - bbox["y0"]

    # Provide raw geometric features
    return {
        "width_px": w,
        "height_px": h,
        "aspect_ratio": round(w / h, 2) if h > 0 else 1,
        "width_pt": round(w / scale_factor, 1),
        "height_pt": round(h / scale_factor, 1),
    }


def check_controls_aligned(controls, scale_factor, page_width, min_aligned=3, tolerance_pt=5):
    """
    Check if controls form a grid pattern (aligned on x or y axis).
    Returns True if >=min_aligned controls share the same x or y coordinate.

    Exception: Controls aligned at the left margin (x < 5% of page width) are
    likely bullet points, not form controls - these don't count as grid alignment.
    """
    if len(controls) < min_aligned:
        return False

    from collections import Counter

    # Left margin threshold: 5% of page width (scales across page sizes)
    left_margin_threshold = page_width * 0.05

    # Get control centers in PDF points
    positions = []
    for c in controls:
        bbox = c["bbox"]
        cx = (bbox["x0"] + bbox["x1"]) / 2 / scale_factor
        cy = (bbox["y0"] + bbox["y1"]) / 2 / scale_factor
        positions.append((cx, cy))

    # Check x-alignment, but exclude left-margin aligned (likely bullets)
    x_positions = [round(cx / tolerance_pt) * tolerance_pt for cx, cy in positions]
    x_counts = Counter(x_positions)

    # Find most common x-position that's NOT at left margin
    valid_x_alignments = [(x, count) for x, count in x_counts.items() if x >= left_margin_threshold]
    max_x_aligned = max((count for x, count in valid_x_alignments), default=0)

    # Check y-alignment (row of controls)
    y_positions = [round(cy / tolerance_pt) * tolerance_pt for cx, cy in positions]
    y_counts = Counter(y_positions)
    max_y_aligned = max(y_counts.values()) if y_counts else 0

    return max_x_aligned >= min_aligned or max_y_aligned >= min_aligned


def has_label_to_left(control, blocks, scale_factor, max_gap_pt=50):
    """
    Check if there's a text block to the left of this control (within max_gap_pt).
    Real form controls typically have labels to their left.
    Bullets at left margin have no label to their left.
    """
    bbox = control["bbox"]
    ctrl_x0 = bbox["x0"] / scale_factor
    ctrl_y_center = (bbox["y0"] + bbox["y1"]) / 2 / scale_factor

    for block in blocks:
        bb = block["bbox"]
        block_y_center = (bb["y0"] + bb["y1"]) / 2

        # Same row (y-centers within 10pt)
        if abs(block_y_center - ctrl_y_center) > 10:
            continue

        # Block is to the left of control
        if bb["x1"] < ctrl_x0:
            gap = ctrl_x0 - bb["x1"]
            if gap <= max_gap_pt:
                return True

    return False


def filter_valid_controls(raw_controls, blocks, scale_factor, page_width, min_size_pt=10):
    """
    Filter detected controls to remove false positives (bullets, letter shapes).

    Valid controls must:
    1. Be at least min_size_pt in both dimensions (default 10pt)
    2. Not be embedded inside a text block (inline bullets)
    3. Not be bullet-like (at left margin with no label to left)

    Additionally, if >=3 controls are grid-aligned (not at left margin),
    treat all size-passing controls as valid (handles forms with icons).

    Returns list of valid controls.
    """
    # Left margin threshold: 5% of page width (scales across page sizes)
    left_margin_threshold = page_width * 0.05

    # First pass: filter by size only
    size_valid = []
    for control in raw_controls:
        bbox = control["bbox"]
        w_px = bbox["x1"] - bbox["x0"]
        h_px = bbox["y1"] - bbox["y0"]

        # Convert to PDF points
        w_pt = w_px / scale_factor
        h_pt = h_px / scale_factor

        # Size check - real controls are at least 10pt
        if w_pt >= min_size_pt and h_pt >= min_size_pt:
            size_valid.append(control)

    # Check if controls are grid-aligned
    if check_controls_aligned(size_valid, scale_factor, page_width):
        # Grid alignment detected - trust these as real controls
        # Just filter out inline ones
        valid = []
        for control in size_valid:
            bbox = control["bbox"]
            ctrl_x = (bbox["x0"] + bbox["x1"]) / 2 / scale_factor
            ctrl_y = (bbox["y0"] + bbox["y1"]) / 2 / scale_factor

            is_inside_text = False
            for block in blocks:
                bb = block["bbox"]
                if (bb["x0"] - 5 <= ctrl_x <= bb["x1"] + 5 and
                    bb["y0"] - 2 <= ctrl_y <= bb["y1"] + 2):
                    is_inside_text = True
                    break

            if not is_inside_text:
                valid.append(control)
        return valid

    # No grid alignment - apply stricter filtering
    valid = []
    for control in size_valid:
        bbox = control["bbox"]
        ctrl_x = (bbox["x0"] + bbox["x1"]) / 2 / scale_factor
        ctrl_y = (bbox["y0"] + bbox["y1"]) / 2 / scale_factor

        # Check if control is inside a text block (inline bullet)
        is_inside_text = False
        for block in blocks:
            bb = block["bbox"]
            if (bb["x0"] - 5 <= ctrl_x <= bb["x1"] + 5 and
                bb["y0"] - 2 <= ctrl_y <= bb["y1"] + 2):
                is_inside_text = True
                break

        if is_inside_text:
            continue

        # Bullet detection: at left margin AND no label to left
        # Real form controls have labels; bullets don't
        is_bullet_like = (
            ctrl_x < left_margin_threshold and
            not has_label_to_left(control, blocks, scale_factor)
        )

        if is_bullet_like:
            continue

        # Accept if not inside text and not bullet-like
        valid.append(control)

    return valid


def extract_combined(pdf_path, page_num=1, debug=False):
    """
    Extract combined layout and controls from a PDF page.

    Pipeline branches based on page type:
    - form: row grouping + control mapping (full processing)
    - text: paragraph segmentation only (skip row grouping)

    Args:
        pdf_path: Path to PDF file
        page_num: Page number (1-indexed)
        debug: Save debug visualizations

    Returns:
        Dict with text blocks, rows (if form), and controls
    """
    pdf_path = Path(pdf_path)

    # Step 1: Extract text layout (blocks only, defer row grouping)
    layout_data = extract_pdf(pdf_path, page_num)
    if not layout_data["pages"]:
        return {"error": "No pages extracted"}

    page_layout = layout_data["pages"][0]
    blocks = page_layout["blocks"]
    page_width = page_layout["width"]
    page_height = page_layout["height"]

    # Step 2: Render page to image for control detection
    image_path = render_page_to_image(pdf_path, page_num, dpi=200)

    try:
        # Step 3: Detect controls
        controls_data = detect_all_controls(image_path, debug=debug)
    finally:
        # Clean up temp file
        Path(image_path).unlink(missing_ok=True)

    scale_factor = controls_data.get("scale_factor", 1.0)
    raw_controls = controls_data["controls"]["checkboxes"]

    # Step 4: Filter controls to remove false positives (bullets, letter shapes)
    valid_controls = filter_valid_controls(raw_controls, blocks, scale_factor, page_width)
    control_count = len(valid_controls)

    # Step 5: Classify page type BEFORE row grouping
    columns = page_layout.get("columns", [])
    classification = classify_page_type(
        blocks, columns, page_width, page_height, control_count
    )
    page_type = classification["page_type"]

    # Step 6: Branch based on page type
    if page_type == "form":
        # Full processing: row grouping + control mapping

        # Step 6a: Try visual row bands first (pixels define structure)
        row_bands = controls_data.get("row_bands", [])
        visual_rows = assign_blocks_to_bands(blocks, row_bands, scale_factor)

        if visual_rows and len(visual_rows) >= 3:
            # Use visual rows - pixels are authoritative
            rows = visual_rows
            row_source = "visual_bands"
            # Classify rows based on content
            rows = classify_rows(rows, page_width, page_layout["stats"])
        else:
            # Fallback: use Y-proximity rows from text extraction
            rows = page_layout["rows"]
            row_source = "text_y_proximity"

        # Step 6.5: Group consecutive rows into logical units
        row_groups = group_consecutive_rows(rows)

        # Step 6.6: Apply grid inference to each row group
        # This ensures all rows in a group have equal column counts
        for group in row_groups:
            grid = apply_grid_to_row_group(rows, group.get("row_indices", []))
            if grid:
                group["grid"] = grid

        # Add features to valid controls (already filtered)
        all_controls = []
        for cb in valid_controls:
            cb["features"] = compute_control_features(cb, scale_factor)
            all_controls.append(cb)

        # Map controls to blocks
        mapped_controls = map_controls_to_blocks(all_controls, blocks, scale_factor)

        result = {
            "source": str(pdf_path),
            "page_number": page_num,
            "page_type": page_type,
            "classification": classification,
            "dimensions": {"width": page_width, "height": page_height},
            "text": {
                "blocks": blocks,
                "rows": rows,
                "row_source": row_source,
                "row_groups": row_groups,
                "columns": columns,
                "stats": page_layout["stats"],
            },
            "controls": {
                "items": mapped_controls,
                "scale_factor": scale_factor,
            },
            "table_borders": controls_data.get("table_borders", {}),
            "visual_sections": controls_data.get("visual_sections", None),
            "summary": {
                "total_blocks": len(blocks),
                "total_rows": len(rows),
                "total_row_groups": len(row_groups),
                "total_controls": len(mapped_controls),
                "visual_tables": controls_data.get("visual_sections", {}).get("total_tables", 0) if controls_data.get("visual_sections") else 0,
                "row_types": {},
            },
        }

        # Count row types
        for row in rows:
            row_type = row.get("type", "unknown")
            result["summary"]["row_types"][row_type] = (
                result["summary"]["row_types"].get(row_type, 0) + 1
            )

    else:
        # Text page: skip row grouping, return blocks as paragraphs
        # Group blocks into simple paragraphs by proximity (no fine-grained row analysis)
        result = {
            "source": str(pdf_path),
            "page_number": page_num,
            "page_type": page_type,
            "classification": classification,
            "dimensions": {"width": page_width, "height": page_height},
            "text": {
                "blocks": blocks,
                "rows": None,  # Explicitly null - not processed
                "row_groups": None,  # Explicitly null - not processed
                "columns": columns,
                "stats": page_layout["stats"],
            },
            "controls": {
                "items": [],  # No control mapping for text pages
                "scale_factor": scale_factor,
            },
            "summary": {
                "total_blocks": len(blocks),
                "total_rows": 0,
                "total_row_groups": 0,
                "total_controls": 0,
                "row_types": None,
                "note": "Row grouping skipped for text page",
            },
        }

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Extract combined layout and controls from PDF"
    )
    parser.add_argument("pdf_path", help="Path to PDF file")
    parser.add_argument("--page", type=int, default=1, help="Page number (1-indexed)")
    parser.add_argument("--output", "-o", help="Output JSON file path")
    parser.add_argument("--debug", action="store_true", help="Save debug images")
    parser.add_argument("--pretty", action="store_true", help="Pretty print JSON")

    args = parser.parse_args()

    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        print(f"Error: File not found: {pdf_path}")
        return 1

    result = extract_combined(pdf_path, args.page, debug=args.debug)

    indent = 2 if args.pretty else None
    json_output = json.dumps(result, indent=indent, ensure_ascii=False)

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(json_output)
        print(f"Output written to: {output_path}")
    else:
        print(json_output)

    return 0


if __name__ == "__main__":
    exit(main())
