#!/usr/bin/env python3
"""
Layout Extractor using PyMuPDF

Extracts text blocks with bounding boxes from digital PDFs.
Outputs structured JSON for downstream layout analysis.

Usage:
    python extract_layout.py <pdf_path> [--page N] [--output path.json]
"""

import fitz
import json
import sys
import argparse
from pathlib import Path


def extract_page_blocks(page):
    """
    Extract text blocks from a single page using PyMuPDF's dict mode.

    PyMuPDF returns individual spans (often single words). We merge adjacent
    spans on the same line into coherent text blocks.

    Returns list of blocks with:
    - text
    - bbox (x0, y0, x1, y1)
    - font_size
    - font_name
    - is_bold (heuristic from font name)
    """
    data = page.get_text("dict")

    # First, collect all spans with their line context
    raw_spans = []

    for block in data["blocks"]:
        if block["type"] != 0:  # Skip non-text blocks (images, etc.)
            continue

        block_bbox = block["bbox"]

        for line in block["lines"]:
            line_bbox = line["bbox"]

            for span in line["spans"]:
                text = span["text"]
                if not text.strip():
                    continue

                bbox = span["bbox"]  # (x0, y0, x1, y1)
                font_name = span.get("font", "")
                font_size = span.get("size", 0)

                raw_spans.append({
                    "text": text,
                    "bbox": bbox,
                    "line_y": round(line_bbox[1], 1),  # Use line's y for grouping
                    "font_size": font_size,
                    "font_name": font_name,
                })

    # Sort by line_y, then x
    raw_spans.sort(key=lambda s: (s["line_y"], s["bbox"][0]))

    # Merge spans on the same line (same line_y, small x-gap)
    blocks = []
    if raw_spans:
        current = raw_spans[0].copy()

        for span in raw_spans[1:]:
            # Same line if line_y matches
            same_line = abs(span["line_y"] - current["line_y"]) < 2

            # Calculate x-gap between current block end and next span start
            x_gap = span["bbox"][0] - current["bbox"][2]

            # Only merge if very close (< 3 pixels = no gap) or small gap with space
            # If gap is larger, keep as separate blocks
            should_merge = same_line and x_gap < 3

            if should_merge:
                # Merge: extend text and bbox (add space between words)
                current["text"] += " " + span["text"]
                current["bbox"] = (
                    current["bbox"][0],
                    min(current["bbox"][1], span["bbox"][1]),
                    span["bbox"][2],
                    max(current["bbox"][3], span["bbox"][3]),
                )
            else:
                # Save current and start new
                blocks.append(current)
                current = span.copy()

        blocks.append(current)

    # Convert to final format
    result = []
    for block in blocks:
        text = block["text"].strip()
        if not text:
            continue

        bbox = block["bbox"]
        font_name = block.get("font_name", "")
        font_size = block.get("font_size", 0)

        # Heuristic: bold fonts often have "Bold" or "bold" in name
        is_bold = "bold" in font_name.lower() or "heavy" in font_name.lower()

        result.append({
            "text": text,
            "bbox": {
                "x0": round(bbox[0], 2),
                "y0": round(bbox[1], 2),
                "x1": round(bbox[2], 2),
                "y1": round(bbox[3], 2),
            },
            "font_size": round(font_size, 2),
            "font_name": font_name,
            "is_bold": is_bold,
        })

    # IMPORTANT: Sort by y then x (don't trust PyMuPDF order)
    result.sort(key=lambda b: (b["bbox"]["y0"], b["bbox"]["x0"]))

    # Merge continuation blocks (paragraphs split at line breaks)
    result = merge_continuation_blocks(result)

    # Assign sequential IDs after sorting and merging
    for i, block in enumerate(result):
        block["id"] = i

    return result


def merge_continuation_blocks(blocks, y_gap_threshold=15, x_tolerance=5):
    """
    Merge blocks that are continuations of the same paragraph.

    PyMuPDF splits paragraphs at visual line breaks. This merges them back
    based on layout signals:
    1. Same x0 position (left margin alignment)
    2. Sequential y position (block N+1 starts near block N end)
    3. Block N doesn't end with sentence terminator (.!?:)
    4. Block N+1 doesn't start with section marker (A., B., •, 1., etc.)
    """
    if not blocks or len(blocks) < 2:
        return blocks

    import re
    section_start = re.compile(r'^([A-Z]\.|[0-9]+\.|[•●○◦‣⁃\-–—])')
    sentence_end = re.compile(r'[.!?:]\s*$')

    merged = []
    current = blocks[0].copy()
    current["bbox"] = current["bbox"].copy()  # Deep copy bbox dict

    for block in blocks[1:]:
        # Check continuation conditions
        same_x = abs(block['bbox']['x0'] - current['bbox']['x0']) < x_tolerance
        sequential_y = block['bbox']['y0'] - current['bbox']['y1'] < y_gap_threshold
        no_terminator = not sentence_end.search(current['text'])
        no_section_marker = not section_start.match(block['text'].lstrip())

        if same_x and sequential_y and no_terminator and no_section_marker:
            # Merge: extend text and bbox
            current['text'] = current['text'] + ' ' + block['text']
            current['bbox']['y1'] = block['bbox']['y1']
            current['bbox']['x1'] = max(current['bbox']['x1'], block['bbox']['x1'])
        else:
            merged.append(current)
            current = block.copy()
            current["bbox"] = current["bbox"].copy()

    merged.append(current)
    return merged


def group_into_rows(blocks, y_tolerance=3):
    """
    Group blocks into rows based on y-coordinate proximity.

    Two blocks are in the same row if their y0 values are within tolerance.
    This is stricter than overlap-based grouping to avoid merging
    different table rows that happen to overlap vertically.
    """
    if not blocks:
        return []

    rows = []
    current_row = [blocks[0]]
    current_y_center = (blocks[0]["bbox"]["y0"] + blocks[0]["bbox"]["y1"]) / 2

    for block in blocks[1:]:
        block_y_center = (block["bbox"]["y0"] + block["bbox"]["y1"]) / 2

        # Same row if y-centers are close
        if abs(block_y_center - current_y_center) <= y_tolerance:
            current_row.append(block)
            # Update center to average of all blocks in row
            current_y_center = sum(
                (b["bbox"]["y0"] + b["bbox"]["y1"]) / 2 for b in current_row
            ) / len(current_row)
        else:
            # New row - save current
            current_row.sort(key=lambda b: b["bbox"]["x0"])
            rows.append({
                "blocks": current_row,
                "y_min": round(min(b["bbox"]["y0"] for b in current_row), 2),
                "y_max": round(max(b["bbox"]["y1"] for b in current_row), 2),
            })
            current_row = [block]
            current_y_center = block_y_center

    # Don't forget the last row
    if current_row:
        current_row.sort(key=lambda b: b["bbox"]["x0"])
        rows.append({
            "blocks": current_row,
            "y_min": round(min(b["bbox"]["y0"] for b in current_row), 2),
            "y_max": round(max(b["bbox"]["y1"] for b in current_row), 2),
        })

    return rows


def classify_row(row, page_width, median_font_size):
    """
    Classify a row based on its content and structure.

    Returns a type string:
    - 'header': Section header (large/bold text, possibly full-width)
    - 'option-row': Row with multiple short options (checkbox/radio candidates)
    - 'label-value': Label followed by input area
    - 'paragraph': Long text spanning most of width
    - 'bullet-item': Text starting with bullet
    - 'numbered-item': Text starting with number
    - 'mixed': Multiple types in same row
    """
    blocks = row["blocks"]
    if not blocks:
        return "empty"

    # Collect text and compute metrics
    all_text = " ".join(b["text"] for b in blocks)
    total_width = row.get("y_max", 0) - row.get("y_min", 0)  # Actually use x-span
    row_x_span = max(b["bbox"]["x1"] for b in blocks) - min(b["bbox"]["x0"] for b in blocks)
    num_blocks = len(blocks)

    # Check for bullet points
    bullet_chars = "•●○◦‣⁃-–—"
    has_bullet = any(b["text"].lstrip().startswith(tuple(bullet_chars)) for b in blocks)

    # Check for numbered items (1), 2), etc. or 1. 2. etc.)
    import re
    numbered_pattern = re.compile(r"^\d+[\)\.\:]")
    has_number = any(numbered_pattern.match(b["text"].lstrip()) for b in blocks)

    # Check if first block is bold or larger than median
    first_block = blocks[0]
    is_bold = first_block.get("is_bold", False)
    is_large = first_block["font_size"] > median_font_size * 1.1

    # Check if row spans most of page width (>70%)
    is_full_width = row_x_span > page_width * 0.7

    # Count short blocks (potential options like "Yes", "No", "Male", "Female")
    short_blocks = [b for b in blocks if len(b["text"]) < 20]
    short_ratio = len(short_blocks) / num_blocks if num_blocks > 0 else 0

    # Classification logic
    if num_blocks == 1:
        text = blocks[0]["text"]
        if has_bullet:
            return "bullet-item"
        elif has_number:
            return "numbered-item"
        elif is_bold or is_large:
            return "header"
        elif len(text) > 100:
            return "paragraph"
        else:
            return "label"

    # Multiple blocks
    if has_bullet:
        return "bullet-list"

    if has_number and num_blocks > 1 and short_ratio > 0.5:
        # Numbered label followed by options
        return "option-row"

    if num_blocks >= 3 and short_ratio > 0.6:
        # Multiple short items = likely options (checkbox/radio candidates)
        return "option-row"

    if num_blocks == 2:
        # Could be label + value or two labels
        first_len = len(blocks[0]["text"])
        second_len = len(blocks[1]["text"])
        if first_len > second_len * 2:
            return "label-value"
        else:
            return "label-pair"

    if is_full_width and num_blocks <= 2:
        return "paragraph"

    return "mixed"


def classify_rows(rows, page_width, stats):
    """Add type classification to all rows."""
    median_font_size = stats.get("median_font_size", 10)

    for row in rows:
        row["type"] = classify_row(row, page_width, median_font_size)

    return rows


def can_group_rows(row1, row2, x_tolerance=10, width_tolerance=0.15):
    """
    Check if two consecutive rows can be grouped together.

    Groupable if:
    1. Same block count (±1 only if extra block is narrow)
    2. First block x0 within tolerance
    3. Similar total width (±15% for multi-block, relaxed for single-block)
    4. Compatible row types
    """
    blocks1 = row1["blocks"]
    blocks2 = row2["blocks"]

    # Block count check (±1 allowed)
    count_diff = abs(len(blocks1) - len(blocks2))
    if count_diff > 1:
        return False

    # If count differs by 1, check if extra block is narrow (e.g., colon, bullet)
    if count_diff == 1:
        # Find the extra block and check its width
        if len(blocks1) > len(blocks2):
            extra_blocks = blocks1
        else:
            extra_blocks = blocks2
        # Check if any block is very narrow (< 20pt)
        narrow_found = any(
            (b["bbox"]["x1"] - b["bbox"]["x0"]) < 20 for b in extra_blocks
        )
        if not narrow_found:
            return False

    # First block x0 alignment
    if blocks1 and blocks2:
        x0_diff = abs(blocks1[0]["bbox"]["x0"] - blocks2[0]["bbox"]["x0"])
        if x0_diff > x_tolerance:
            return False

    # Total width similarity - more lenient for single-block rows
    width1 = max(b["bbox"]["x1"] for b in blocks1) - min(b["bbox"]["x0"] for b in blocks1) if blocks1 else 0
    width2 = max(b["bbox"]["x1"] for b in blocks2) - min(b["bbox"]["x0"] for b in blocks2) if blocks2 else 0

    if width1 > 0 and width2 > 0:
        # For single-block rows (labels), be more lenient with width
        # Labels can vary naturally in text length
        if len(blocks1) == 1 and len(blocks2) == 1:
            # Skip width check for single-block label rows
            pass
        else:
            width_ratio = min(width1, width2) / max(width1, width2)
            if width_ratio < (1 - width_tolerance):
                return False

    # Compatible row types
    compatible_types = {
        "label-value": ["label-value", "label-pair", "mixed"],
        "label-pair": ["label-value", "label-pair", "mixed"],
        "option-row": ["option-row"],
        "header": [],  # Headers don't group
        "paragraph": [],  # Paragraphs don't group
        "bullet-item": ["bullet-item"],
        "bullet-list": ["bullet-list", "bullet-item"],
        "numbered-item": ["numbered-item"],
        "label": ["label", "label-value"],
        "mixed": ["label-value", "label-pair", "mixed"],
    }

    type1 = row1.get("type", "mixed")
    type2 = row2.get("type", "mixed")

    allowed = compatible_types.get(type1, [])
    if type2 not in allowed and type1 not in compatible_types.get(type2, []):
        # Allow same type to group
        if type1 != type2:
            return False

    return True


def infer_group_hint(rows):
    """
    Infer the hint type for a group of rows.

    Returns: 'grid', 'options', 'table', 'stack', or 'list'
    """
    if not rows:
        return "unknown"

    types = [r.get("type", "mixed") for r in rows]

    # Check for option rows
    if all(t == "option-row" for t in types):
        return "options"

    # Check for bullet/numbered lists
    if all(t in ["bullet-item", "bullet-list"] for t in types):
        return "list"
    if all(t == "numbered-item" for t in types):
        return "list"

    # Check for label-value patterns (grid)
    if all(t in ["label-value", "label-pair", "mixed"] for t in types):
        # Check if multiple columns (grid) vs single column (stack)
        avg_blocks = sum(len(r["blocks"]) for r in rows) / len(rows)
        if avg_blocks >= 2:
            return "grid"
        else:
            return "stack"

    # Default to grid for mixed content
    return "grid"


def group_consecutive_rows(rows, x_tolerance=10):
    """
    Group consecutive rows that form logical layout units.

    Key principle: Be conservative. Better to miss a grouping than over-group.

    Minimum group sizes:
    - grid: 3+ rows (to avoid false positives)
    - options/stack/list: 2+ rows

    Returns list of row groups with hints.
    """
    if not rows or len(rows) < 2:
        return []

    groups = []
    current_group = [rows[0]]
    group_counter = 0

    for row in rows[1:]:
        if can_group_rows(current_group[-1], row, x_tolerance):
            current_group.append(row)
        else:
            # Finalize current group if it meets size requirements
            if len(current_group) >= 2:
                hint = infer_group_hint(current_group)

                # Grid requires 3+ rows to avoid false positives
                min_size = 3 if hint == "grid" else 2

                if len(current_group) >= min_size:
                    # Find row indices
                    row_indices = []
                    for gr in current_group:
                        # Find the index of this row in the original rows list
                        for i, r in enumerate(rows):
                            if r is gr:
                                row_indices.append(i)
                                break

                    groups.append({
                        "id": f"g{group_counter}",
                        "row_indices": row_indices,
                        "hint": hint,
                        "row_count": len(current_group),
                    })
                    group_counter += 1

            current_group = [row]

    # Don't forget last group
    if len(current_group) >= 2:
        hint = infer_group_hint(current_group)
        min_size = 3 if hint == "grid" else 2

        if len(current_group) >= min_size:
            row_indices = []
            for gr in current_group:
                for i, r in enumerate(rows):
                    if r is gr:
                        row_indices.append(i)
                        break

            groups.append({
                "id": f"g{group_counter}",
                "row_indices": row_indices,
                "hint": hint,
                "row_count": len(current_group),
            })

    return groups


# =============================================================================
# GRID INFERENCE (Stage 1)
# =============================================================================
# These functions implement geometry-first row structure:
# 1. Collect ALL X boundaries from ALL rows in a group
# 2. Cluster them to create canonical column grid
# 3. Map each row's blocks to grid columns
# =============================================================================


def cluster_positions(xs, tolerance=15):
    """
    Cluster nearby X positions to prevent micro-columns from OCR jitter.

    When extracting text from PDFs/images, nearby boundaries may differ
    by a few pixels due to OCR variance. This clusters them to get
    canonical boundaries.

    Args:
        xs: List of X positions
        tolerance: Maximum distance between positions in same cluster

    Returns:
        List of cluster centroids (canonical boundaries)
    """
    if not xs:
        return []

    xs = sorted(xs)
    clusters = [[xs[0]]]

    for x in xs[1:]:
        if abs(x - clusters[-1][-1]) <= tolerance:
            clusters[-1].append(x)
        else:
            clusters.append([x])

    return [sum(cluster) / len(cluster) for cluster in clusters]


def infer_grid_columns(row_group_rows, tolerance=15):
    """
    Collect ALL X boundaries from ALL rows in a group.
    Cluster them to get canonical column boundaries.

    Key insight: The column structure is defined by the UNION of all
    X positions across all rows, not by any single row.

    Args:
        row_group_rows: List of row dicts, each with 'blocks' array
        tolerance: Clustering tolerance for nearby positions

    Returns:
        List of (x0, x1) tuples representing column boundaries
    """
    all_x = []

    for row in row_group_rows:
        for block in row.get("blocks", []):
            bbox = block.get("bbox", {})
            if "x0" in bbox and "x1" in bbox:
                all_x.append(bbox["x0"])
                all_x.append(bbox["x1"])

    if not all_x:
        return []

    # Cluster to prevent spurious micro-columns
    boundaries = cluster_positions(all_x, tolerance)

    if len(boundaries) < 2:
        return []

    # Create column ranges from consecutive boundaries
    columns = [(boundaries[i], boundaries[i + 1])
               for i in range(len(boundaries) - 1)]

    return columns


def map_row_to_grid(row, columns):
    """
    Map blocks to grid columns. Insert None for empty columns.

    A block occupies ONE contiguous run of columns. We place it
    at the start column only - other columns in the span will be None.
    This prepares for colspan computation in Stage 3.

    Args:
        row: Row dict with 'blocks' array
        columns: List of (x0, x1) column boundaries

    Returns:
        List of cells (block dict or None for each column)
    """
    if not columns:
        return []

    cells = [None] * len(columns)

    for block in row.get("blocks", []):
        bbox = block.get("bbox", {})
        block_x0 = bbox.get("x0", 0)
        block_x1 = bbox.get("x1", 0)

        # Find first and last overlapping column
        start_col = None
        end_col = None

        for i, (col_x0, col_x1) in enumerate(columns):
            # Check if block overlaps this column
            if block_x0 < col_x1 and block_x1 > col_x0:
                if start_col is None:
                    start_col = i
                end_col = i

        # Place block at start column only (no duplication)
        # Other columns in span will remain None (reserved for Stage 3)
        if start_col is not None:
            cells[start_col] = block

    return cells


def apply_grid_to_row_group(rows, row_indices):
    """
    Apply grid inference to a single row group.

    Returns a grid-mapped structure with:
    - columns: number of columns
    - column_boundaries: list of (x0, x1) tuples
    - rows: list of row dicts, each with 'cells' array

    Args:
        rows: All rows from the page
        row_indices: Indices of rows in this group

    Returns:
        Dict with grid structure, or None if not enough data
    """
    if not row_indices:
        return None

    # Get the rows in this group
    group_rows = [rows[i] for i in row_indices if i < len(rows)]

    if not group_rows:
        return None

    # Infer column grid from all rows
    columns = infer_grid_columns(group_rows)

    if not columns:
        return None

    # Map each row to the grid
    grid_rows = []
    for row in group_rows:
        cells = map_row_to_grid(row, columns)
        grid_rows.append({
            "y_min": row.get("y_min"),
            "y_max": row.get("y_max"),
            "type": row.get("type"),
            "cells": cells,
        })

    return {
        "columns": len(columns),
        "column_boundaries": [(round(x0, 2), round(x1, 2)) for x0, x1 in columns],
        "rows": grid_rows,
    }


def detect_columns(rows, x_tolerance=10):
    """
    Analyze column structure across rows.

    Returns list of detected column x-positions.
    """
    # Collect all x0 values
    x_positions = []
    for row in rows:
        for block in row["blocks"]:
            x_positions.append(block["bbox"]["x0"])

    if not x_positions:
        return []

    # Cluster x positions
    x_positions.sort()
    columns = []
    current_cluster = [x_positions[0]]

    for x in x_positions[1:]:
        if x - current_cluster[-1] < x_tolerance:
            current_cluster.append(x)
        else:
            # Save cluster center
            columns.append(round(sum(current_cluster) / len(current_cluster), 2))
            current_cluster = [x]

    if current_cluster:
        columns.append(round(sum(current_cluster) / len(current_cluster), 2))

    return columns


def compute_stats(blocks):
    """
    Compute statistics about the blocks for header detection.
    """
    if not blocks:
        return {}

    font_sizes = [b["font_size"] for b in blocks]

    return {
        "median_font_size": round(sorted(font_sizes)[len(font_sizes) // 2], 2),
        "min_font_size": round(min(font_sizes), 2),
        "max_font_size": round(max(font_sizes), 2),
        "total_blocks": len(blocks),
    }


def classify_page_type(blocks, columns, page_width, page_height, control_count=0):
    """
    Classify page as 'form', 'table', or 'text' based on layout features.

    This determines which processing pipeline to apply:
    - form: row grouping + control mapping
    - table: table structure detection
    - text: paragraph segmentation only (skip row grouping)

    Returns dict with page_type and the signals used for classification.
    """
    if not blocks:
        return {"page_type": "text", "signals": {}, "reason": "no blocks"}

    # Calculate classification signals
    page_area = page_width * page_height

    # 1. Control count - strong form indicator
    has_controls = control_count > 0

    # 2. Column count - multi-column suggests text layout
    column_count = len(columns) if columns else 1
    # Filter to significant columns (used by multiple blocks)
    if columns:
        from collections import Counter
        x_positions = [round(b["bbox"]["x0"] / 10) * 10 for b in blocks]
        col_usage = Counter(x_positions)
        significant_cols = len([c for c, count in col_usage.items() if count >= 3])
        column_count = max(1, significant_cols // 3)  # Rough column estimate

    # 3. Text density - blocks per page area (normalized)
    text_density = len(blocks) / (page_area / 10000)  # per 100x100 pt area

    # 4. Average block width ratio - prose has wide blocks
    block_widths = [b["bbox"]["x1"] - b["bbox"]["x0"] for b in blocks]
    avg_width = sum(block_widths) / len(block_widths) if block_widths else 0
    width_ratio = avg_width / page_width if page_width > 0 else 0

    # 5. X-alignment score - how many blocks share x-positions (grid indicator)
    x_starts = [round(b["bbox"]["x0"]) for b in blocks]
    from collections import Counter
    x_counts = Counter(x_starts)
    aligned_blocks = sum(c for c in x_counts.values() if c >= 3)
    alignment_score = aligned_blocks / len(blocks) if blocks else 0

    signals = {
        "control_count": control_count,
        "column_count": column_count,
        "text_density": round(text_density, 3),
        "avg_width_ratio": round(width_ratio, 3),
        "alignment_score": round(alignment_score, 3),
        "block_count": len(blocks),
    }

    # Classification logic
    # Priority: controls > density checks > alignment

    # Forms: have multiple controls - strongest signal
    # Require >=2 to avoid false positives from bullets/letters
    if control_count >= 2:
        return {
            "page_type": "form",
            "signals": signals,
            "reason": "has_controls",
        }

    # Text pages: high density + no controls = dense prose (like T&C)
    # Even if aligned, dense text without controls is not a form
    if text_density > 5 and not has_controls:
        return {
            "page_type": "text",
            "signals": signals,
            "reason": "high_density_no_controls",
        }

    # Text pages: multi-column layout without controls
    if column_count >= 2 and not has_controls:
        return {
            "page_type": "text",
            "signals": signals,
            "reason": "multi_column",
        }

    # Forms: strong grid alignment with moderate density
    if alignment_score > 0.4 and width_ratio < 0.6 and text_density < 5:
        return {
            "page_type": "form",
            "signals": signals,
            "reason": "grid_alignment",
        }

    # Text pages: wide blocks suggest paragraphs
    if width_ratio > 0.7 and text_density > 0.5:
        return {
            "page_type": "text",
            "signals": signals,
            "reason": "prose_layout",
        }

    # Default to form (safer to over-process)
    return {
        "page_type": "form",
        "signals": signals,
        "reason": "default",
    }


def extract_pdf(pdf_path, page_num=None):
    """
    Extract layout from PDF.

    Args:
        pdf_path: Path to PDF file
        page_num: Optional specific page (1-indexed). If None, extracts all pages.

    Returns:
        Dict with pages array, each containing blocks, rows, columns, stats
    """
    doc = fitz.open(pdf_path)

    pages = []

    if page_num is not None:
        # Extract specific page (convert to 0-indexed)
        page_indices = [page_num - 1]
    else:
        page_indices = range(len(doc))

    for page_idx in page_indices:
        if page_idx < 0 or page_idx >= len(doc):
            continue

        page = doc[page_idx]

        # Get page dimensions
        rect = page.rect
        page_width = round(rect.width, 2)
        page_height = round(rect.height, 2)

        # Extract blocks
        blocks = extract_page_blocks(page)

        # Group into rows
        rows = group_into_rows(blocks)

        # Compute stats
        stats = compute_stats(blocks)

        # Classify rows
        rows = classify_rows(rows, page_width, stats)

        # Detect columns
        columns = detect_columns(rows)

        pages.append({
            "page_number": page_idx + 1,
            "width": page_width,
            "height": page_height,
            "blocks": blocks,
            "rows": rows,
            "columns": columns,
            "stats": stats,
        })

    doc.close()

    return {
        "source": str(pdf_path),
        "total_pages": len(doc) if page_num is None else 1,
        "pages": pages,
    }


def main():
    parser = argparse.ArgumentParser(description="Extract layout from PDF")
    parser.add_argument("pdf_path", help="Path to PDF file")
    parser.add_argument("--page", type=int, help="Extract specific page (1-indexed)")
    parser.add_argument("--output", "-o", help="Output JSON file path")
    parser.add_argument("--pretty", action="store_true", help="Pretty print JSON")

    args = parser.parse_args()

    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        print(f"Error: File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    result = extract_pdf(pdf_path, args.page)

    indent = 2 if args.pretty else None
    json_output = json.dumps(result, indent=indent, ensure_ascii=False)

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(json_output)
        print(f"Output written to: {output_path}", file=sys.stderr)
    else:
        print(json_output)


if __name__ == "__main__":
    main()
