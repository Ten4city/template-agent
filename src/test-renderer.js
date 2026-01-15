/**
 * Test script for IR Renderer
 *
 * Validates sample IR and renders to HTML.
 * Run: node src/test-renderer.js
 */

import fs from 'fs';
import { validateDocumentIR, checkHallucinationRisk } from './schema/validator.js';
import { renderDocument } from './renderer/html-renderer.js';
import { sampleFormIR } from './examples/sample-form-ir.js';

console.log('='.repeat(60));
console.log('IR RENDERER TEST');
console.log('='.repeat(60));

// Step 1: Validate the IR
console.log('\n1. Validating IR...\n');

const validationResult = validateDocumentIR(sampleFormIR);

if (validationResult.valid) {
  console.log('   ✓ IR is valid');
} else {
  console.log('   ✗ IR validation failed:');
  validationResult.errors.forEach(e => console.log(`     - ${e}`));
}

if (validationResult.warnings.length > 0) {
  console.log('\n   Warnings:');
  validationResult.warnings.forEach(w => console.log(`     - ${w}`));
}

// Step 2: Check for hallucination risk
console.log('\n2. Checking for hallucination risk...\n');

const hallucinationWarnings = checkHallucinationRisk(sampleFormIR);

if (hallucinationWarnings.length === 0) {
  console.log('   ✓ No hallucination risk detected');
} else {
  console.log('   ⚠ Potential hallucination risks:');
  hallucinationWarnings.forEach(w => console.log(`     - ${w}`));
}

// Step 3: Render to HTML
console.log('\n3. Rendering to HTML...\n');

// Mock text blocks (in real usage, these come from extraction)
const textBlocks = {};

const html = renderDocument(sampleFormIR, textBlocks);

// Step 4: Save output
const outputPath = 'src/output/sample-form-rendered.html';
fs.mkdirSync('src/output', { recursive: true });
fs.writeFileSync(outputPath, html);

console.log(`   ✓ HTML rendered successfully`);
console.log(`   ✓ Output saved to: ${outputPath}`);
console.log(`   ✓ File size: ${(html.length / 1024).toFixed(2)} KB`);

// Step 5: Summary
console.log('\n' + '='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log(`
Document: ${sampleFormIR.title}
Pages: ${sampleFormIR.pages.length}
Sections: ${sampleFormIR.pages.reduce((sum, p) => sum + p.sections.length, 0)}
Validation: ${validationResult.valid ? 'PASSED' : 'FAILED'}
Warnings: ${validationResult.warnings.length}
Hallucination risks: ${hallucinationWarnings.length}
`);

console.log('Open the output file in a browser to preview the rendered form.');
console.log(`\n   open ${outputPath}\n`);
