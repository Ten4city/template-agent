#!/usr/bin/env python3
"""
Control Detector using OpenCV

Detects form controls (checkboxes, radio buttons, input boxes) from document images.
Works with either rendered PDF pages or scanned document images.

Usage:
    python detect_controls.py <image_path> [--output path.json] [--debug]
"""

import cv2
import numpy as np
import json
import argparse
from pathlib import Path


def preprocess_image(image):
    """
    Preprocess image for control detection.
    Returns grayscale and binary (thresholded) versions.
    """
    # Convert to grayscale if needed
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)

    # Adaptive thresholding for varying lighting conditions
    binary = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2
    )

    return gray, binary


def detect_checkboxes(gray, binary, min_size=8, max_size=25):
    """
    Detect checkbox-like shapes (small squares with borders).

    Checkboxes are characterized by:
    - Square or near-square aspect ratio
    - Small size (typically 8-25 pixels at 72 DPI)
    - Clear border (hollow rectangle)
    - 4 corners (approximately rectangular)

    Returns list of detected checkboxes with bounding boxes.
    """
    checkboxes = []

    # Use binary threshold to find bordered shapes
    # RETR_LIST finds all contours including nested ones
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    for contour in contours:
        # Get bounding rectangle
        x, y, w, h = cv2.boundingRect(contour)

        # Size filter
        if w < min_size or h < min_size or w > max_size or h > max_size:
            continue

        # Aspect ratio check (should be roughly square)
        aspect_ratio = w / h if h > 0 else 0
        if aspect_ratio < 0.7 or aspect_ratio > 1.4:
            continue

        # Approximate contour to polygon
        epsilon = 0.02 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)

        # Rectangles should have 4 vertices (with some tolerance)
        if len(approx) < 4 or len(approx) > 8:
            continue

        # Check if it looks like a bordered box (hollow)
        roi = gray[y:y+h, x:x+w]
        if roi.size == 0:
            continue

        # Check center vs border intensity
        border_width = max(2, min(w, h) // 4)
        if w > 2*border_width and h > 2*border_width:
            center = roi[border_width:-border_width, border_width:-border_width]
            if center.size > 0:
                center_mean = np.mean(center)
                full_mean = np.mean(roi)

                # For unchecked checkbox: center should be light (white/empty)
                # For checked checkbox: center has mark (darker)
                is_checked = bool(center_mean < 220)  # Dark center = checked

                # Confidence based on how square-like and bordered it looks
                # Good checkbox: has clear border (darker edges) with distinct center
                edge_pixels = roi[0, :].mean() + roi[-1, :].mean() + roi[:, 0].mean() + roi[:, -1].mean()
                edge_mean = edge_pixels / 4

                # Border should be darker than center for unchecked
                has_border = edge_mean < center_mean + 30

                if has_border:
                    confidence = 0.7
                    checkboxes.append({
                        "type": "checkbox",
                        "bbox": {"x0": int(x), "y0": int(y), "x1": int(x + w), "y1": int(y + h)},
                        "checked": is_checked,
                        "confidence": round(confidence, 2),
                    })

    # Remove duplicates/overlapping
    checkboxes = remove_overlapping(checkboxes, iou_threshold=0.3)

    return checkboxes


def detect_radio_buttons(gray, binary, scale_factor=1.0):
    """
    Detect radio button-like shapes (small circles).

    Radio buttons are characterized by:
    - Circular shape with clear border
    - Consistent size within document
    - Ring pattern (border with hollow center for unselected)

    Args:
        gray: Grayscale image
        binary: Binary (thresholded) image
        scale_factor: Image scale relative to 72 DPI (e.g., 2.0 for 144 DPI)

    Returns list of detected radio buttons with bounding boxes.
    """
    radio_buttons = []

    # Scale parameters based on image resolution
    # At 72 DPI, radio buttons are typically 4-8 pixels radius
    # At 200 DPI (~2.78x), they're 11-22 pixels
    base_min_radius = int(4 * scale_factor)
    base_max_radius = int(10 * scale_factor)
    min_dist = int(20 * scale_factor)

    # Use Hough Circle Transform with stricter parameters
    circles = cv2.HoughCircles(
        gray,  # Use grayscale for better edge detection
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min_dist,
        param1=80,  # Higher = stricter edge detection
        param2=25,  # Higher = fewer false positives
        minRadius=base_min_radius,
        maxRadius=base_max_radius,
    )

    if circles is not None:
        circles = np.uint16(np.around(circles))
        for circle in circles[0, :]:
            cx, cy, r = int(circle[0]), int(circle[1]), int(circle[2])
            x0, y0 = cx - r, cy - r
            x1, y1 = cx + r, cy + r

            # Bounds check
            if x0 < 0 or y0 < 0 or x1 >= binary.shape[1] or y1 >= binary.shape[0]:
                continue

            # Additional validation: check for ring pattern
            # A radio button should have:
            # 1. Strong edge (border) at the perimeter
            # 2. Relatively empty center (for unselected) or filled center (selected)

            # Create masks for perimeter and center
            outer_mask = np.zeros(binary.shape, dtype=np.uint8)
            inner_mask = np.zeros(binary.shape, dtype=np.uint8)
            cv2.circle(outer_mask, (cx, cy), r, 255, -1)
            cv2.circle(inner_mask, (cx, cy), max(1, r - int(3 * scale_factor)), 255, -1)

            # Perimeter mask = outer - inner
            perimeter_mask = outer_mask - inner_mask

            # Count filled pixels in perimeter and center
            perimeter_pixels = np.sum(binary[perimeter_mask > 0] > 0)
            center_pixels = np.sum(binary[inner_mask > 0] > 0)

            perimeter_area = np.sum(perimeter_mask > 0)
            center_area = np.sum(inner_mask > 0)

            perimeter_ratio = perimeter_pixels / perimeter_area if perimeter_area > 0 else 0
            center_ratio = center_pixels / center_area if center_area > 0 else 0

            # Valid radio button: should have visible perimeter (>0.3)
            # and either empty center (<0.3) or filled center (>0.6)
            has_border = perimeter_ratio > 0.25
            is_hollow = center_ratio < 0.35
            is_filled = center_ratio > 0.5

            if has_border and (is_hollow or is_filled):
                is_selected = bool(is_filled)
                confidence = round(min(perimeter_ratio + 0.3, 1.0), 2)

                radio_buttons.append(
                    {
                        "type": "radio",
                        "bbox": {"x0": x0, "y0": y0, "x1": x1, "y1": y1},
                        "center": {"x": cx, "y": cy},
                        "radius": r,
                        "selected": is_selected,
                        "confidence": confidence,
                    }
                )

    return radio_buttons


def detect_input_boxes(gray, binary, min_width=50, min_height=12, max_height=40):
    """
    Detect input box-like shapes (horizontal rectangles).

    Input boxes are characterized by:
    - Horizontal rectangle (width >> height)
    - Border lines (edges)
    - Usually empty or with placeholder text

    Returns list of detected input boxes with bounding boxes.
    """
    input_boxes = []

    # Edge detection
    edges = cv2.Canny(gray, 50, 150)

    # Dilate edges to connect broken lines
    kernel = np.ones((2, 2), np.uint8)
    dilated = cv2.dilate(edges, kernel, iterations=1)

    # Find contours
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    for contour in contours:
        # Get bounding rectangle
        x, y, w, h = cv2.boundingRect(contour)

        # Size filter for input boxes
        if w < min_width or h < min_height or h > max_height:
            continue

        # Aspect ratio check (should be horizontal rectangle)
        aspect_ratio = w / h if h > 0 else 0
        if aspect_ratio < 2:  # Width should be at least 2x height
            continue

        # Check if it looks like a bordered box
        # Look at the perimeter vs area ratio
        perimeter = cv2.arcLength(contour, True)
        area = cv2.contourArea(contour)

        if area < 100:
            continue

        # Approximate to polygon
        epsilon = 0.02 * perimeter
        approx = cv2.approxPolyDP(contour, epsilon, True)

        # Should be roughly rectangular (4 corners)
        if len(approx) >= 4 and len(approx) <= 8:
            # Calculate rectangularity
            rect_area = w * h
            extent = area / rect_area if rect_area > 0 else 0

            if extent > 0.3:
                input_boxes.append(
                    {
                        "type": "input",
                        "bbox": {"x0": int(x), "y0": int(y), "x1": int(x + w), "y1": int(y + h)},
                        "confidence": round(extent, 2),
                    }
                )

    # Remove overlapping boxes (keep larger ones)
    input_boxes = remove_overlapping(input_boxes)

    return input_boxes


def detect_table_borders(gray, min_line_length=50):
    """
    Detect table borders (horizontal and vertical lines).

    Uses morphological operations to isolate lines.

    Returns dict with horizontal and vertical line segments.
    """
    # Threshold
    _, binary = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

    # Detect horizontal lines
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (min_line_length, 1))
    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel)

    # Detect vertical lines
    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_line_length))
    vertical = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel)

    # Find horizontal line segments
    h_contours, _ = cv2.findContours(horizontal, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h_lines = []
    for contour in h_contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w > min_line_length:
            h_lines.append({"y": int(y + h // 2), "x0": int(x), "x1": int(x + w)})

    # Find vertical line segments
    v_contours, _ = cv2.findContours(vertical, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    v_lines = []
    for contour in v_contours:
        x, y, w, h = cv2.boundingRect(contour)
        if h > min_line_length:
            v_lines.append({"x": int(x + w // 2), "y0": int(y), "y1": int(y + h)})

    return {
        "horizontal": sorted(h_lines, key=lambda l: l["y"]),
        "vertical": sorted(v_lines, key=lambda l: l["x"]),
    }


def detect_row_bands(gray, min_gap=5, min_row_height=8):
    """
    Detect visual row bands using horizontal projection histogram.

    This detects horizontal bands of content separated by whitespace,
    regardless of individual text baseline positions.

    Args:
        gray: Grayscale image
        min_gap: Minimum whitespace gap (in pixels) to separate rows
        min_row_height: Minimum height (in pixels) for a valid row

    Returns:
        List of row bands: [{"y0": int, "y1": int}, ...]
        Sorted top to bottom.
    """
    # Invert: text becomes white (255), background becomes black (0)
    _, binary = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

    # Horizontal projection: sum pixels along each row
    # Result is a 1D array where each element is the sum of that row
    projection = np.sum(binary, axis=1)

    # Normalize to 0-1 range
    max_val = np.max(projection) if np.max(projection) > 0 else 1
    normalized = projection / max_val

    # Find content regions (where projection > threshold)
    # Threshold chosen to ignore noise/light artifacts
    threshold = 0.02
    is_content = normalized > threshold

    # Find transitions (start/end of content regions)
    bands = []
    in_content = False
    start_y = 0

    for y in range(len(is_content)):
        if is_content[y] and not in_content:
            # Start of content region
            start_y = y
            in_content = True
        elif not is_content[y] and in_content:
            # End of content region
            end_y = y
            height = end_y - start_y
            if height >= min_row_height:
                bands.append({"y0": start_y, "y1": end_y})
            in_content = False

    # Don't forget last band if image ends in content
    if in_content:
        end_y = len(is_content)
        height = end_y - start_y
        if height >= min_row_height:
            bands.append({"y0": start_y, "y1": end_y})

    # Merge bands that are too close (gap < min_gap)
    if len(bands) > 1:
        merged = [bands[0]]
        for band in bands[1:]:
            gap = band["y0"] - merged[-1]["y1"]
            if gap < min_gap:
                # Merge with previous band
                merged[-1]["y1"] = band["y1"]
            else:
                merged.append(band)
        bands = merged

    return bands


def remove_overlapping(controls, iou_threshold=0.5):
    """
    Remove overlapping controls, keeping the one with higher confidence.
    """
    if not controls:
        return controls

    # Sort by confidence descending
    controls = sorted(controls, key=lambda c: c.get("confidence", 0), reverse=True)

    keep = []
    for control in controls:
        bbox = control["bbox"]
        overlaps = False

        for kept in keep:
            kept_bbox = kept["bbox"]
            # Calculate IoU
            x0 = max(bbox["x0"], kept_bbox["x0"])
            y0 = max(bbox["y0"], kept_bbox["y0"])
            x1 = min(bbox["x1"], kept_bbox["x1"])
            y1 = min(bbox["y1"], kept_bbox["y1"])

            if x0 < x1 and y0 < y1:
                intersection = (x1 - x0) * (y1 - y0)
                area1 = (bbox["x1"] - bbox["x0"]) * (bbox["y1"] - bbox["y0"])
                area2 = (kept_bbox["x1"] - kept_bbox["x0"]) * (kept_bbox["y1"] - kept_bbox["y0"])
                union = area1 + area2 - intersection
                iou = intersection / union if union > 0 else 0

                if iou > iou_threshold:
                    overlaps = True
                    break

        if not overlaps:
            keep.append(control)

    return keep


def find_table_regions(h_lines, v_lines, min_overlap=0.3, tolerance=10):
    """
    Find separate table regions by grouping lines that overlap horizontally/vertically.

    Tables on a page often don't share the same column structure - e.g., a form
    table on the left and a photo box on the right. This function identifies
    distinct table regions.

    Args:
        h_lines: Horizontal lines [{"y": int, "x0": int, "x1": int}, ...]
        v_lines: Vertical lines [{"x": int, "y0": int, "y1": int}, ...]
        min_overlap: Minimum fraction of overlap to consider lines related
        tolerance: Tolerance for clustering

    Returns:
        List of table regions, each containing the lines that form that table
    """
    if not h_lines or not v_lines:
        return []

    # Group horizontal lines by their X span
    # Lines that have similar x0-x1 ranges belong to the same vertical "column" of tables
    def lines_overlap_x(line1, line2, min_pct=0.3):
        """Check if two horizontal lines overlap significantly in X."""
        x0 = max(line1["x0"], line2["x0"])
        x1 = min(line1["x1"], line2["x1"])
        if x1 <= x0:
            return False
        overlap = x1 - x0
        span1 = line1["x1"] - line1["x0"]
        span2 = line2["x1"] - line2["x0"]
        return overlap / min(span1, span2) >= min_pct

    # Build groups of related horizontal lines
    h_groups = []
    used = [False] * len(h_lines)

    for i, line in enumerate(h_lines):
        if used[i]:
            continue
        group = [line]
        used[i] = True

        for j in range(i + 1, len(h_lines)):
            if used[j]:
                continue
            # Check if this line overlaps with any line in the group
            if any(lines_overlap_x(line, group_line) for group_line in group):
                group.append(h_lines[j])
                used[j] = True

        h_groups.append(group)

    # For each horizontal line group, find the bounding box
    regions = []
    for h_group in h_groups:
        if len(h_group) < 2:  # Need at least 2 lines to form a table
            continue

        # Get bounding X range for this group
        x0 = min(l["x0"] for l in h_group)
        x1 = max(l["x1"] for l in h_group)
        y0 = min(l["y"] for l in h_group)
        y1 = max(l["y"] for l in h_group)

        # Find vertical lines that fall within this X range
        region_v_lines = [
            v for v in v_lines
            if x0 - tolerance <= v["x"] <= x1 + tolerance
            and v["y0"] <= y1 + tolerance
            and v["y1"] >= y0 - tolerance
        ]

        if len(region_v_lines) < 2:  # Need at least 2 vertical lines
            continue

        regions.append({
            "bbox": {"x0": x0, "y0": y0, "x1": x1, "y1": y1},
            "h_lines": h_group,
            "v_lines": region_v_lines
        })

    # Sort regions top-to-bottom, left-to-right
    regions.sort(key=lambda r: (r["bbox"]["y0"], r["bbox"]["x0"]))

    return regions


def build_cell_grid_from_lines(h_lines, v_lines, tolerance=10):
    """
    Build a cell grid from detected horizontal and vertical lines.

    This creates a grid of cells based on line intersections, where each cell
    has explicit boundaries. This is the foundation for detecting:
    - Empty cells (no text in cell bounds)
    - Rowspan (text spanning multiple rows)
    - Colspan (text spanning multiple columns)

    Args:
        h_lines: List of horizontal lines [{"y": int, "x0": int, "x1": int}, ...]
        v_lines: List of vertical lines [{"x": int, "y0": int, "y1": int}, ...]
        tolerance: Pixels tolerance for clustering nearby lines

    Returns:
        {
            "rows": [y0, y1, y2, ...],  # Y boundaries (sorted top to bottom)
            "cols": [x0, x1, x2, ...],  # X boundaries (sorted left to right)
            "cells": [
                [{"row": 0, "col": 0, "bbox": {"x0": ..., "y0": ..., "x1": ..., "y1": ...}}, ...],
                ...
            ]
        }
    """
    if not h_lines or not v_lines:
        return None

    # Extract Y positions from horizontal lines
    y_positions = [line["y"] for line in h_lines]

    # Extract X positions from vertical lines
    x_positions = [line["x"] for line in v_lines]

    # Cluster nearby positions to handle slight variations
    def cluster_positions(positions, tolerance):
        """Cluster nearby positions and return cluster centers."""
        if not positions:
            return []

        positions = sorted(positions)
        clusters = [[positions[0]]]

        for pos in positions[1:]:
            if abs(pos - clusters[-1][-1]) <= tolerance:
                clusters[-1].append(pos)
            else:
                clusters.append([pos])

        # Return the mean of each cluster as the canonical position
        return [int(sum(c) / len(c)) for c in clusters]

    # Get canonical row and column boundaries
    row_boundaries = cluster_positions(y_positions, tolerance)
    col_boundaries = cluster_positions(x_positions, tolerance)

    # Need at least 2 boundaries to form cells
    if len(row_boundaries) < 2 or len(col_boundaries) < 2:
        return None

    # Build cell grid
    cells = []
    for row_idx in range(len(row_boundaries) - 1):
        row_cells = []
        y0 = row_boundaries[row_idx]
        y1 = row_boundaries[row_idx + 1]

        for col_idx in range(len(col_boundaries) - 1):
            x0 = col_boundaries[col_idx]
            x1 = col_boundaries[col_idx + 1]

            row_cells.append({
                "row": row_idx,
                "col": col_idx,
                "bbox": {"x0": x0, "y0": y0, "x1": x1, "y1": y1}
            })

        cells.append(row_cells)

    return {
        "row_boundaries": row_boundaries,
        "col_boundaries": col_boundaries,
        "num_rows": len(row_boundaries) - 1,
        "num_cols": len(col_boundaries) - 1,
        "cells": cells
    }


def build_table_grids(h_lines, v_lines, tolerance=10):
    """
    Build cell grids for each detected table region.

    Unlike build_cell_grid_from_lines which creates one mega-grid,
    this function identifies separate table regions and builds a
    grid for each one.

    Returns:
        List of table grids, each with bbox and cells
    """
    regions = find_table_regions(h_lines, v_lines, tolerance=tolerance)

    table_grids = []
    for region in regions:
        grid = build_cell_grid_from_lines(
            region["h_lines"],
            region["v_lines"],
            tolerance=tolerance
        )
        if grid:
            grid["region_bbox"] = region["bbox"]
            table_grids.append(grid)

    return table_grids


def segment_page_into_tables(h_lines, min_gap=60):
    """
    Segment the page into distinct table regions based on Y gaps.

    When horizontal lines have large Y gaps between them, it indicates
    separate tables or sections on the page.

    Args:
        h_lines: Horizontal lines sorted by Y position
        min_gap: Minimum Y gap to consider as table boundary

    Returns:
        List of (y_start, y_end) tuples for each table region
    """
    if not h_lines:
        return []

    # Sort by Y position
    sorted_lines = sorted(h_lines, key=lambda l: l['y'])
    y_positions = [l['y'] for l in sorted_lines]

    # Find gaps
    regions = []
    region_start = y_positions[0]

    for i in range(1, len(y_positions)):
        gap = y_positions[i] - y_positions[i-1]
        if gap > min_gap:
            # End current region, start new one
            regions.append((region_start, y_positions[i-1]))
            region_start = y_positions[i]

    # Add final region
    regions.append((region_start, y_positions[-1]))

    return regions


def detect_visual_sections(h_lines, v_lines, page_width, page_height, y_range=None):
    """
    Detect semantic visual sections from line structure.

    Instead of creating pixel-perfect grids, this identifies logical zones:
    - Form sections (where label-input pairs appear)
    - Photo/image boxes
    - Data tables

    This information helps the LLM make semantic decisions about column structure.

    Args:
        h_lines: Horizontal lines [{"y": int, "x0": int, "x1": int}, ...]
        v_lines: Vertical lines [{"x": int, "y0": int, "y1": int}, ...]
        page_width: Page width in pixels
        page_height: Page height in pixels
        y_range: Optional (y_min, y_max) to limit analysis to a region

    Returns:
        {
            "tables": [
                {
                    "region": (y_start, y_end),
                    "sections": [...],
                    "row_boundaries": [...],
                    "num_rows": N
                }
            ],
            "total_tables": N
        }
    """
    if not h_lines or not v_lines:
        return None

    # First, segment page into distinct table regions
    table_regions = segment_page_into_tables(h_lines, min_gap=60)

    all_tables = []

    for region_idx, (y_start, y_end) in enumerate(table_regions):
        # Get lines for this region
        region_h_lines = [l for l in h_lines if y_start <= l['y'] <= y_end]

        if len(region_h_lines) < 2:
            continue

        # Cluster Y positions within this region
        y_positions = sorted(set(l['y'] for l in region_h_lines))

        def cluster_positions(positions, gap=25):
            if not positions:
                return []
            groups = [[positions[0]]]
            for p in positions[1:]:
                if p - groups[-1][-1] <= gap:
                    groups[-1].append(p)
                else:
                    groups.append([p])
            return [int(sum(g)/len(g)) for g in groups]

        row_boundaries = cluster_positions(y_positions, gap=25)

        # Analyze sections within this table region
        left_boundary = page_width * 0.45
        right_start = page_width * 0.40
        photo_start = page_width * 0.75

        left_lines = [l for l in region_h_lines if l['x1'] < left_boundary]
        # Right form lines: start after middle, end before photo area
        right_lines = [l for l in region_h_lines
                       if l['x0'] > right_start and l['x1'] < photo_start]
        # Photo lines: extend to far right
        photo_lines = [l for l in region_h_lines if l['x1'] > photo_start]

        sections = []

        if left_lines:
            sections.append({
                "type": "form_section",
                "side": "left",
                "bbox": {
                    "x0": min(l['x0'] for l in left_lines),
                    "y0": min(l['y'] for l in left_lines),
                    "x1": max(l['x1'] for l in left_lines),
                    "y1": max(l['y'] for l in left_lines)
                }
            })

        if right_lines:
            sections.append({
                "type": "form_section",
                "side": "right",
                "bbox": {
                    "x0": min(l['x0'] for l in right_lines),
                    "y0": min(l['y'] for l in right_lines),
                    "x1": max(l['x1'] for l in right_lines),
                    "y1": max(l['y'] for l in right_lines)
                }
            })

        if photo_lines:
            photo_y_min = min(l['y'] for l in photo_lines)
            photo_y_max = max(l['y'] for l in photo_lines)
            rows_in_photo = [y for y in row_boundaries
                            if photo_y_min <= y <= photo_y_max]
            rowspan = max(1, len(rows_in_photo) - 1)

            sections.append({
                "type": "photo_box",
                "bbox": {
                    "x0": min(l['x0'] for l in photo_lines),
                    "y0": photo_y_min,
                    "x1": max(l['x1'] for l in photo_lines),
                    "y1": photo_y_max
                },
                "rowspan": rowspan
            })

        all_tables.append({
            "table_index": region_idx,
            "region": {"y_start": y_start, "y_end": y_end},
            "sections": sections,
            "row_boundaries": row_boundaries,
            "num_rows": len(row_boundaries) - 1 if len(row_boundaries) > 1 else 0
        })

    return {
        "tables": all_tables,
        "total_tables": len(all_tables)
    }


def assign_text_to_cells(cell_grid, text_blocks, scale_factor=1.0):
    """
    Assign text blocks to cells based on geometric overlap.

    Args:
        cell_grid: Output from build_cell_grid_from_lines()
        text_blocks: List of text blocks [{"text": str, "bbox": {...}}, ...]
        scale_factor: Scale factor to convert between image and text coords

    Returns:
        Cell grid with "content" added to each cell:
        {
            "cells": [[{"row": 0, "col": 0, "bbox": {...}, "content": [blocks...]}, ...], ...]
        }
    """
    if not cell_grid or not text_blocks:
        return cell_grid

    # Create a deep copy to avoid modifying original
    import copy
    result = copy.deepcopy(cell_grid)

    # Initialize content for all cells
    for row in result["cells"]:
        for cell in row:
            cell["content"] = []

    # For each text block, find which cell it belongs to
    for block in text_blocks:
        block_bbox = block.get("bbox", {})

        # Scale block coordinates to match cell grid (image) coordinates
        bx0 = block_bbox.get("x0", 0) * scale_factor
        by0 = block_bbox.get("y0", 0) * scale_factor
        bx1 = block_bbox.get("x1", 0) * scale_factor
        by1 = block_bbox.get("y1", 0) * scale_factor

        # Find center of block
        block_center_x = (bx0 + bx1) / 2
        block_center_y = (by0 + by1) / 2

        # Find which cell contains this block's center
        for row in result["cells"]:
            for cell in row:
                cell_bbox = cell["bbox"]
                if (cell_bbox["x0"] <= block_center_x <= cell_bbox["x1"] and
                    cell_bbox["y0"] <= block_center_y <= cell_bbox["y1"]):
                    cell["content"].append(block)
                    break
            else:
                continue
            break

    return result


def detect_spans(cell_grid):
    """
    Detect rowspan and colspan from cell grid content.

    Rules:
    - If a cell has content and cells below it are empty, it's a rowspan candidate
    - If a cell has content and cells to its right are empty, it's a colspan candidate

    Args:
        cell_grid: Output from assign_text_to_cells()

    Returns:
        List of span info:
        [{"row": 0, "col": 0, "rowspan": 3, "colspan": 1, "content": [...]}, ...]
    """
    if not cell_grid:
        return []

    cells = cell_grid["cells"]
    num_rows = len(cells)
    num_cols = len(cells[0]) if cells else 0

    # Track which cells are consumed by spans
    consumed = [[False] * num_cols for _ in range(num_rows)]

    spans = []

    for row_idx in range(num_rows):
        for col_idx in range(num_cols):
            if consumed[row_idx][col_idx]:
                continue

            cell = cells[row_idx][col_idx]

            # Check rowspan: how many empty cells below?
            rowspan = 1
            if cell["content"]:
                for check_row in range(row_idx + 1, num_rows):
                    if not cells[check_row][col_idx]["content"]:
                        rowspan += 1
                    else:
                        break

            # Check colspan: how many empty cells to the right?
            colspan = 1
            if cell["content"]:
                for check_col in range(col_idx + 1, num_cols):
                    if not cells[row_idx][check_col]["content"]:
                        colspan += 1
                    else:
                        break

            # Mark consumed cells
            for r in range(row_idx, row_idx + rowspan):
                for c in range(col_idx, col_idx + colspan):
                    consumed[r][c] = True

            spans.append({
                "row": row_idx,
                "col": col_idx,
                "rowspan": rowspan,
                "colspan": colspan,
                "content": cell["content"],
                "bbox": cell["bbox"],
                "is_empty": len(cell["content"]) == 0
            })

    return spans


def detect_all_controls(image_path, debug=False):
    """
    Detect all form controls in an image.

    Args:
        image_path: Path to image file
        debug: If True, save debug visualization

    Returns:
        Dict with detected controls by type
    """
    # Load image
    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"Could not load image: {image_path}")

    height, width = image.shape[:2]

    # Calculate scale factor based on image resolution
    # Standard A4 at 72 DPI is ~595x842 pixels
    # If image is larger, controls will be proportionally larger
    standard_height = 842  # A4 at 72 DPI
    scale_factor = height / standard_height

    # Preprocess
    gray, binary = preprocess_image(image)

    # Detect controls with scaled parameters
    checkboxes = detect_checkboxes(gray, binary,
                                   min_size=int(8 * scale_factor),
                                   max_size=int(30 * scale_factor))
    radio_buttons = detect_radio_buttons(gray, binary, scale_factor)
    input_boxes = detect_input_boxes(gray, binary,
                                     min_width=int(50 * scale_factor),
                                     min_height=int(12 * scale_factor),
                                     max_height=int(40 * scale_factor))
    table_borders = detect_table_borders(gray, min_line_length=30)

    # Detect visual row bands for structure
    row_bands = detect_row_bands(gray,
                                 min_gap=int(3 * scale_factor),
                                 min_row_height=int(6 * scale_factor))

    # Build cell grid from detected table lines
    cell_grid = build_cell_grid_from_lines(
        table_borders["horizontal"],
        table_borders["vertical"],
        tolerance=int(10 * scale_factor)
    )

    # Detect semantic visual sections (form areas, photo boxes, etc.)
    visual_sections = detect_visual_sections(
        table_borders["horizontal"],
        table_borders["vertical"],
        width, height
    )

    result = {
        "source": str(image_path),
        "dimensions": {"width": width, "height": height},
        "scale_factor": round(scale_factor, 2),
        "controls": {
            "checkboxes": checkboxes,
            "radio_buttons": radio_buttons,
            "input_boxes": input_boxes,
        },
        "table_borders": table_borders,
        "row_bands": row_bands,
        "cell_grid": cell_grid,
        "visual_sections": visual_sections,
        "summary": {
            "total_checkboxes": len(checkboxes),
            "total_radio_buttons": len(radio_buttons),
            "total_input_boxes": len(input_boxes),
            "horizontal_lines": len(table_borders["horizontal"]),
            "vertical_lines": len(table_borders["vertical"]),
            "row_bands": len(row_bands),
            "grid_rows": cell_grid["num_rows"] if cell_grid else 0,
            "grid_cols": cell_grid["num_cols"] if cell_grid else 0,
            "visual_tables_count": visual_sections["total_tables"] if visual_sections else 0,
        },
    }

    # Debug visualization
    if debug:
        debug_image = image.copy()

        # Draw checkboxes (green)
        for cb in checkboxes:
            bbox = cb["bbox"]
            color = (0, 200, 0) if cb["checked"] else (0, 255, 0)
            cv2.rectangle(debug_image, (bbox["x0"], bbox["y0"]), (bbox["x1"], bbox["y1"]), color, 2)
            cv2.putText(
                debug_image,
                "CB",
                (bbox["x0"], bbox["y0"] - 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.3,
                color,
                1,
            )

        # Draw radio buttons (blue)
        for rb in radio_buttons:
            center = rb["center"]
            color = (200, 0, 0) if rb["selected"] else (255, 0, 0)
            cv2.circle(debug_image, (center["x"], center["y"]), rb["radius"], color, 2)
            cv2.putText(
                debug_image,
                "RB",
                (center["x"] - 5, center["y"] - rb["radius"] - 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.3,
                color,
                1,
            )

        # Draw input boxes (red)
        for ib in input_boxes:
            bbox = ib["bbox"]
            cv2.rectangle(debug_image, (bbox["x0"], bbox["y0"]), (bbox["x1"], bbox["y1"]), (0, 0, 255), 2)
            cv2.putText(
                debug_image,
                "INPUT",
                (bbox["x0"], bbox["y0"] - 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.3,
                (0, 0, 255),
                1,
            )

        # Draw table borders (orange)
        for line in table_borders["horizontal"]:
            cv2.line(debug_image, (line["x0"], line["y"]), (line["x1"], line["y"]), (0, 165, 255), 1)
        for line in table_borders["vertical"]:
            cv2.line(debug_image, (line["x"], line["y0"]), (line["x"], line["y1"]), (0, 165, 255), 1)

        # Draw row bands (cyan, semi-transparent rectangles)
        for i, band in enumerate(row_bands):
            # Draw top and bottom lines
            cv2.line(debug_image, (0, band["y0"]), (width, band["y0"]), (255, 255, 0), 1)
            cv2.line(debug_image, (0, band["y1"]), (width, band["y1"]), (255, 255, 0), 1)
            # Label
            cv2.putText(
                debug_image,
                f"R{i}",
                (5, band["y0"] + 12),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.4,
                (255, 255, 0),
                1,
            )

        debug_path = Path(image_path).parent / f"{Path(image_path).stem}_controls_debug.png"
        cv2.imwrite(str(debug_path), debug_image)
        result["debug_image"] = str(debug_path)

    return result


def main():
    parser = argparse.ArgumentParser(description="Detect form controls in document image")
    parser.add_argument("image_path", help="Path to image file")
    parser.add_argument("--output", "-o", help="Output JSON file path")
    parser.add_argument("--debug", action="store_true", help="Save debug visualization")
    parser.add_argument("--pretty", action="store_true", help="Pretty print JSON")

    args = parser.parse_args()

    image_path = Path(args.image_path)
    if not image_path.exists():
        print(f"Error: File not found: {image_path}")
        return 1

    result = detect_all_controls(image_path, debug=args.debug)

    indent = 2 if args.pretty else None
    json_output = json.dumps(result, indent=indent)

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(json_output)
        print(f"Output written to: {output_path}")
    else:
        print(json_output)

    return 0


if __name__ == "__main__":
    exit(main())
