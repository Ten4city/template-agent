#!/usr/bin/env node

/**
 * Test Edit CLI
 *
 * Test the structure editor via command line.
 *
 * Usage:
 *   node src/test-edit.js --structure path/to/structure.json --element 1 --prompt "merge first row"
 *   node src/test-edit.js --structure path/to/structure.json --element 1 --row 0 --col 0 --prompt "change text to 'Name:'"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runEditAgent } from './editor/edit-agent.js';
import { generatePreview, formatChanges } from './editor/preview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(args) {
  const result = {
    structure: null,
    element: null,
    row: null,
    col: null,
    prompt: null,
    output: null,
    verbose: true,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--structure':
      case '-s':
        result.structure = args[++i];
        break;
      case '--element':
      case '-e':
        result.element = parseInt(args[++i], 10);
        break;
      case '--row':
      case '-r':
        result.row = parseInt(args[++i], 10);
        break;
      case '--col':
      case '-c':
        result.col = parseInt(args[++i], 10);
        break;
      case '--prompt':
      case '-p':
        result.prompt = args[++i];
        break;
      case '--output':
      case '-o':
        result.output = args[++i];
        break;
      case '--quiet':
      case '-q':
        result.verbose = false;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return result;
}

function printHelp() {
  console.log(`
Test Edit CLI - Test the structure editor

Usage:
  node src/test-edit.js [options]

Options:
  -s, --structure <path>   Path to structure JSON file (required)
  -e, --element <index>    Element index to edit (required)
  -r, --row <index>        Row index (optional, for cell selection)
  -c, --col <index>        Column index (optional, for cell selection)
  -p, --prompt <text>      Edit instruction (required)
  -o, --output <path>      Output path for edited structure (optional)
  -q, --quiet              Less verbose output
  -h, --help               Show this help

Examples:
  # Merge first row of table at element index 1
  node src/test-edit.js -s output/structure.json -e 1 -p "merge the first row"

  # Change cell text
  node src/test-edit.js -s output/structure.json -e 1 -r 0 -c 0 -p "change text to 'Full Name:'"

  # Remove borders
  node src/test-edit.js -s output/structure.json -e 1 -p "remove borders"

  # Delete a row
  node src/test-edit.js -s output/structure.json -e 1 -p "delete the second row"
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Validate required args
  if (!args.structure) {
    console.error('Error: --structure is required');
    printHelp();
    process.exit(1);
  }

  if (args.element === null || isNaN(args.element)) {
    console.error('Error: --element is required');
    printHelp();
    process.exit(1);
  }

  if (!args.prompt) {
    console.error('Error: --prompt is required');
    printHelp();
    process.exit(1);
  }

  // Load structure
  const structurePath = path.resolve(args.structure);
  if (!fs.existsSync(structurePath)) {
    console.error(`Error: Structure file not found: ${structurePath}`);
    process.exit(1);
  }

  const structure = JSON.parse(fs.readFileSync(structurePath, 'utf-8'));

  // Validate element exists
  const element = structure.pages?.[0]?.elements?.[args.element];
  if (!element) {
    console.error(`Error: Element ${args.element} not found in structure`);
    console.error(`Available elements: 0-${(structure.pages?.[0]?.elements?.length || 1) - 1}`);
    process.exit(1);
  }

  // Build selection
  const selection = {
    type: args.row !== null && args.col !== null ? 'cell' : 'element',
    elementIndex: args.element,
  };

  if (args.row !== null) {
    selection.startRow = args.row;
    selection.endRow = args.row;
  }

  if (args.col !== null) {
    selection.startCol = args.col;
    selection.endCol = args.col;
  }

  console.log('='.repeat(60));
  console.log('EDIT TEST');
  console.log('='.repeat(60));
  console.log(`Structure: ${structurePath}`);
  console.log(`Element: ${args.element} (${element.type})`);
  console.log(`Selection: ${JSON.stringify(selection)}`);
  console.log(`Prompt: ${args.prompt}`);
  console.log('='.repeat(60));

  try {
    // Run edit agent
    const result = await runEditAgent(structure, selection, args.prompt, {
      verbose: args.verbose,
    });

    console.log('\n' + '='.repeat(60));
    console.log('RESULT');
    console.log('='.repeat(60));
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Tools used: ${result.toolsUsed.join(', ') || 'none'}`);
    console.log(`Summary: ${result.summary}`);

    if (result.validationErrors?.length > 0) {
      console.log('\nValidation warnings:');
      result.validationErrors.forEach((e) => console.log(`  - ${e}`));
    }

    // Generate preview
    const preview = generatePreview(structure, result.editedStructure);
    console.log('\nChanges:');
    console.log(formatChanges(preview.changes));

    // Save output if requested
    if (args.output) {
      const outputPath = path.resolve(args.output);
      fs.writeFileSync(outputPath, JSON.stringify(result.editedStructure, null, 2));
      console.log(`\nEdited structure saved to: ${outputPath}`);
    } else {
      // Default output paths
      const defaultStructurePath = path.join(__dirname, 'output/edited-structure.json');
      const defaultHtmlPath = path.join(__dirname, 'output/edited-output.html');

      fs.writeFileSync(defaultStructurePath, JSON.stringify(result.editedStructure, null, 2));
      fs.writeFileSync(defaultHtmlPath, preview.after);

      console.log(`\nEdited structure saved to: ${defaultStructurePath}`);
      console.log(`Edited HTML saved to: ${defaultHtmlPath}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('EDITED ELEMENT');
    console.log('='.repeat(60));
    const editedElement = result.editedStructure.pages[0]?.elements[args.element];
    console.log(JSON.stringify(editedElement, null, 2));
  } catch (error) {
    console.error('\nError:', error.message);
    if (args.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
