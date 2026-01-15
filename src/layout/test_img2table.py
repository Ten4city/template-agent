#!/usr/bin/env python3
"""
Test visual sections detection on Gold Loan form.
Compare automated detection to ground truth HTML structure.
"""

import sys
sys.path.insert(0, '/Users/ritik/vision-html-agent-v/src/layout')

from detect_controls import detect_all_controls
import json

image_path = "/Users/ritik/Downloads/Doc for testing/Gold Loan Application cum Ledger_271025-render/Gold Loan Application cum Ledger_271025-01.png"

print("Detecting controls and visual sections...")
result = detect_all_controls(image_path, debug=True)

print(f"\n=== SUMMARY ===")
print(f"Horizontal lines: {result['summary']['horizontal_lines']}")
print(f"Vertical lines: {result['summary']['vertical_lines']}")
print(f"Visual tables detected: {result['summary']['visual_tables_count']}")

# Show visual sections per table
visual = result.get('visual_sections')
if visual and visual.get('tables'):
    print(f"\n=== TABLES DETECTED ({visual['total_tables']}) ===")

    for table in visual['tables']:
        region = table['region']
        print(f"\nTable {table['table_index']+1}: Y={region['y_start']}-{region['y_end']}")
        print(f"  Rows: {table['num_rows']}")
        print(f"  Row boundaries: {table['row_boundaries'][:8]}{'...' if len(table['row_boundaries']) > 8 else ''}")

        for section in table['sections']:
            bbox = section['bbox']
            if section['type'] == 'photo_box':
                print(f"  - Photo Box: rowspan={section['rowspan']}")
            else:
                print(f"  - Form ({section.get('side', '')}): x={bbox['x0']}-{bbox['x1']}")

# Find main form table (first table with photo box)
main_form = None
if visual and visual.get('tables'):
    for t in visual['tables']:
        if any(s['type'] == 'photo_box' for s in t['sections']):
            main_form = t
            break

# Compare to ground truth
print(f"\n=== GROUND TRUTH COMPARISON ===")
print(f"""
Ground Truth (from manual HTML):
  - 10 tables total
  - Main form: 7 columns, 8+ rows
  - Photo cell: rowspan=8

Our Detection:
  - Tables: {visual['total_tables'] if visual else 0} (GT: 10)
  - Main form rows: {main_form['num_rows'] if main_form else 0} (GT: ~8)
  - Photo rowspan: {next((s['rowspan'] for s in main_form['sections'] if s['type'] == 'photo_box'), 0) if main_form else 0} (GT: 8)

Match: {'GOOD' if main_form and main_form['num_rows'] >= 6 else 'NEEDS TUNING'}
""")
