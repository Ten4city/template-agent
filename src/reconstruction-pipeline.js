/**
 * Reconstruction Pipeline
 *
 * Simplified pipeline for visual reconstruction only.
 * DOCX → Images → LLM → Simple Structure → HTML
 *
 * No field detection, no row grouping, no complex IR.
 *
 * Usage:
 *   node src/reconstruction-pipeline.js <document.docx> [options]
 *
 * Options:
 *   --verbose       Show detailed progress
 *   --page-limit N  Process only first N pages
 *   --output PATH   Output HTML file path
 */

import fs from 'fs';
import path from 'path';
import { renderDocxToImages } from '../render.js';
import { extractLayout } from './layout/index.js';
import { extractDocumentStructure } from './extractor/reconstruction-extractor.js';
import { renderDocumentStructure } from './renderer/reconstruction-renderer.js';

// =============================================================================
// MAIN PIPELINE
// =============================================================================

async function runReconstructionPipeline(docxPath, options = {}) {
  const {
    verbose = false,
    pageLimit = null,
    startPage = 1,
    outputPath = null,
  } = options;

  const startTime = Date.now();
  const logs = [];

  const log = (msg) => {
    console.log(msg);
    logs.push(msg);
  };

  log('='.repeat(60));
  log('RECONSTRUCTION PIPELINE');
  log('='.repeat(60));
  log(`\nDocument: ${docxPath}`);

  // Step 1: Render to images
  log('\n[1/3] Rendering document to images...');
  const renderResult = await renderDocxToImages(docxPath);
  const { pdfPath } = renderResult;
  let imagePaths = renderResult.imagePaths;
  log(`      Generated ${imagePaths.length} page images`);

  // Apply page range
  if (startPage > 1) {
    imagePaths = imagePaths.slice(startPage - 1);
    log(`      Starting from page ${startPage}`);
  }
  if (pageLimit && pageLimit < imagePaths.length) {
    imagePaths = imagePaths.slice(0, pageLimit);
    log(`      Limited to ${pageLimit} pages`);
  }

  // Step 2: Extract text blocks (for long text lookup only)
  log('\n[2/3] Extracting text blocks...');
  const textBlocksByPage = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const pageNum = startPage + i;
    try {
      const layout = await extractLayout(pdfPath, { page: pageNum });
      const blocks = layout.text?.blocks || [];
      textBlocksByPage.push(blocks);
      log(`      Page ${pageNum}: ${blocks.length} text blocks`);
    } catch (err) {
      log(`      Page ${pageNum}: extraction failed - ${err.message}`);
      textBlocksByPage.push([]);
    }
  }

  // Step 3: Extract structure using LLM
  log('\n[3/3] Extracting structure using LLM...');
  const { documentStructure, pageResults } = await extractDocumentStructure(imagePaths, {
    verbose,
    textBlocksByPage,
  });

  const successfulPages = pageResults.filter((r) => r.success).length;
  const totalIterations = pageResults.reduce((sum, r) => sum + r.iterations, 0);
  log(`      Processed ${imagePaths.length} pages`);
  log(`      Successful: ${successfulPages}/${imagePaths.length}`);
  log(`      Total iterations: ${totalIterations}`);

  // Render HTML
  log('\nRendering HTML...');
  const html = renderDocumentStructure(documentStructure, textBlocksByPage);
  log(`      HTML size: ${(html.length / 1024).toFixed(2)} KB`);

  // Save output
  const outputFile = outputPath || 'src/output/reconstruction-output.html';
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, html);
  log(`      Saved to: ${outputFile}`);

  // Save structure for debugging
  const structureFile = outputFile.replace('.html', '-structure.json');
  fs.writeFileSync(structureFile, JSON.stringify(documentStructure, null, 2));
  log(`      Structure saved to: ${structureFile}`);

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalElements = documentStructure.pages.reduce(
    (sum, p) => sum + (p.elements?.length || 0),
    0
  );

  log('\n' + '='.repeat(60));
  log('SUMMARY');
  log('='.repeat(60));
  log(`
Document:      ${path.basename(docxPath)}
Pages:         ${imagePaths.length}
Elements:      ${totalElements}
Iterations:    ${totalIterations}
Duration:      ${duration}s
Output:        ${outputFile}
`);

  // Save logs
  const logFile = outputFile.replace('.html', '-logs.txt');
  fs.writeFileSync(logFile, logs.join('\n'));

  return {
    documentStructure,
    html,
    pageResults,
    stats: {
      pages: imagePaths.length,
      elements: totalElements,
      iterations: totalIterations,
      duration,
    },
  };
}

// =============================================================================
// CLI
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Usage: node src/reconstruction-pipeline.js <document.docx> [options]

Options:
  --verbose       Show detailed progress
  --page-limit N  Process only first N pages
  --start-page N  Start from page N
  --output PATH   Output HTML file path
  --help          Show this help

Example:
  node src/reconstruction-pipeline.js ./document.docx --verbose --page-limit 1
`);
    process.exit(0);
  }

  // Parse arguments
  const docxPath = args[0];
  const verbose = args.includes('--verbose');
  const pageLimitIndex = args.indexOf('--page-limit');
  const pageLimit = pageLimitIndex !== -1 ? parseInt(args[pageLimitIndex + 1], 10) : null;
  const startPageIndex = args.indexOf('--start-page');
  const startPage = startPageIndex !== -1 ? parseInt(args[startPageIndex + 1], 10) : 1;
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : null;

  // Check file exists
  if (!fs.existsSync(docxPath)) {
    console.error(`Error: File not found: ${docxPath}`);
    process.exit(1);
  }

  try {
    await runReconstructionPipeline(docxPath, {
      verbose,
      pageLimit,
      startPage,
      outputPath,
    });

    // Open output in browser
    const outputFile = outputPath || 'src/output/reconstruction-output.html';
    console.log(`\nOpening output in browser...`);
    const { exec } = await import('child_process');
    exec(`open "${outputFile}"`);
  } catch (error) {
    console.error('\nPipeline failed:', error.message);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
main();

export { runReconstructionPipeline };
