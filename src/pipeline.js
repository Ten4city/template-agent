/**
 * IR Pipeline
 *
 * Full document processing pipeline:
 * DOCX → Extract blocks → Render images → LLM extracts IR → Validate → Render HTML
 *
 * Usage:
 *   node src/pipeline.js <document.docx> [options]
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
import { extractDocumentIRGemini as extractDocumentIR } from './extractor/gemini-extractor.js';
import { validateDocumentIR, checkHallucinationRisk } from './schema/validator.js';
import { renderDocument } from './renderer/html-renderer.js';

// =============================================================================
// MAIN PIPELINE
// =============================================================================

async function runPipeline(docxPath, options = {}) {
  const {
    verbose = false,
    pageLimit = null,
    startPage = 1,
    outputPath = null,
  } = options;

  const startTime = Date.now();
  const logs = [];

  // Helper to log to both console and buffer
  const log = (msg) => {
    console.log(msg);
    logs.push(msg);
  };

  log('='.repeat(60));
  log('IR PIPELINE');
  log('='.repeat(60));
  log(`\nDocument: ${docxPath}`);

  // Step 1: Render to images
  log('\n[1/4] Rendering document to images...');
  const renderResult = await renderDocxToImages(docxPath);
  const { pdfPath } = renderResult;
  let imagePaths = renderResult.imagePaths;
  log(`      Generated ${imagePaths.length} page images`);

  // Apply page range if specified
  if (startPage > 1) {
    imagePaths = imagePaths.slice(startPage - 1);
    log(`      Starting from page ${startPage}`);
  }
  if (pageLimit && pageLimit < imagePaths.length) {
    imagePaths = imagePaths.slice(0, pageLimit);
    log(`      Limited to ${pageLimit} pages`);
  }

  // Step 2: Extract layout (rows, controls, page classification)
  log('\n[2/4] Extracting layout...');
  const layoutDataByPage = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const pageNum = startPage + i;
    try {
      const layout = await extractLayout(pdfPath, { page: pageNum });
      layoutDataByPage.push(layout);
      const rowCount = layout.text?.rows?.length || 0;
      const controlCount = layout.controls?.items?.length || 0;
      const blockCount = layout.text?.blocks?.length || 0;
      log(`      Page ${pageNum}: type=${layout.page_type}, rows=${rowCount}, controls=${controlCount}, blocks=${blockCount}`);
    } catch (err) {
      log(`      Page ${pageNum}: layout extraction failed - ${err.message}`);
      layoutDataByPage.push(null);
    }
  }

  // Calculate total blocks across all pages
  const totalBlocks = layoutDataByPage.reduce((sum, layout) => {
    return sum + (layout?.text?.blocks?.length || 0);
  }, 0);

  // Step 3: Extract IR using LLM
  log('\n[3/4] Extracting IR using LLM...');
  const { documentIR, pageResults } = await extractDocumentIR(imagePaths, {
    verbose,
    layoutDataByPage,
  });

  const successfulPages = pageResults.filter((r) => r.valid).length;
  const totalIterations = pageResults.reduce((sum, r) => sum + r.iterations, 0);
  log(`      Processed ${imagePaths.length} pages`);
  log(`      Successful: ${successfulPages}/${imagePaths.length}`);
  log(`      Total iterations: ${totalIterations}`);

  // Step 4: Validate IR and Render HTML
  log('\n[4/4] Validating IR...');
  const validationResult = validateDocumentIR(documentIR);
  const hallucinationRisks = checkHallucinationRisk(documentIR);

  if (validationResult.valid) {
    log('      IR is valid');
  } else {
    log('      IR validation FAILED:');
    validationResult.errors.forEach((e) => log(`        - ${e}`));
  }

  if (validationResult.warnings.length > 0) {
    log(`      Warnings: ${validationResult.warnings.length}`);
    if (verbose) {
      validationResult.warnings.forEach((w) => log(`        - ${w}`));
    }
  }

  if (hallucinationRisks.length > 0) {
    log(`      Hallucination risks: ${hallucinationRisks.length}`);
    hallucinationRisks.forEach((w) => log(`        - ${w}`));
  }

  // STOP if validation failed or hallucination risks exist
  if (!validationResult.valid) {
    log('\n[ABORT] Validation failed - not rendering HTML');
    log('Fix validation errors and re-run the pipeline.');

    // Save logs anyway
    const outputFile = outputPath || 'src/output/pipeline-output.html';
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    const logFile = outputFile.replace('.html', '-logs.txt');
    fs.writeFileSync(logFile, logs.join('\n'));
    log(`      Logs saved to: ${logFile}`);

    // Save failed IR for debugging
    const irFile = outputFile.replace('.html', '-ir-failed.json');
    fs.writeFileSync(irFile, JSON.stringify(documentIR, null, 2));
    log(`      Failed IR saved to: ${irFile}`);

    return {
      documentIR,
      html: null,
      pageResults,
      validationResult,
      hallucinationRisks,
      aborted: true,
      stats: {
        blocks: totalBlocks,
        pages: imagePaths.length,
        iterations: totalIterations,
        duration: ((Date.now() - startTime) / 1000).toFixed(1),
      },
    };
  }

  if (hallucinationRisks.length > 0) {
    log('\n[ABORT] Hallucination risks detected - not rendering HTML');
    log('Model produced text without blockIndex references. Re-run to force proper block lookups.');

    const outputFile = outputPath || 'src/output/pipeline-output.html';
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    const logFile = outputFile.replace('.html', '-logs.txt');
    fs.writeFileSync(logFile, logs.join('\n'));
    log(`      Logs saved to: ${logFile}`);

    const irFile = outputFile.replace('.html', '-ir-failed.json');
    fs.writeFileSync(irFile, JSON.stringify(documentIR, null, 2));
    log(`      Failed IR saved to: ${irFile}`);

    return {
      documentIR,
      html: null,
      pageResults,
      validationResult,
      hallucinationRisks,
      aborted: true,
      stats: {
        blocks: totalBlocks,
        pages: imagePaths.length,
        iterations: totalIterations,
        duration: ((Date.now() - startTime) / 1000).toFixed(1),
      },
    };
  }

  // Render HTML
  log('\nRendering HTML...');

  const html = renderDocument(documentIR, layoutDataByPage);
  log(`      HTML size: ${(html.length / 1024).toFixed(2)} KB`);

  // Save output
  const outputFile = outputPath || 'src/output/pipeline-output.html';
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, html);
  log(`      Saved to: ${outputFile}`);

  // Also save the IR for debugging
  const irFile = outputFile.replace('.html', '-ir.json');
  fs.writeFileSync(irFile, JSON.stringify(documentIR, null, 2));
  log(`      IR saved to: ${irFile}`);

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  log('\n' + '='.repeat(60));
  log('SUMMARY');
  log('='.repeat(60));
  log(`
Document:      ${path.basename(docxPath)}
Text blocks:   ${totalBlocks}
Pages:         ${imagePaths.length}
Iterations:    ${totalIterations}
Valid:         ${validationResult.valid ? 'YES' : 'NO'}
Warnings:      ${validationResult.warnings.length}
Hallucination: ${hallucinationRisks.length} risks
Duration:      ${duration}s
Output:        ${outputFile}
`);

  // Save logs to file
  const logFile = outputFile.replace('.html', '-logs.txt');
  fs.writeFileSync(logFile, logs.join('\n'));
  console.log(`      Logs saved to: ${logFile}`);

  return {
    documentIR,
    html,
    pageResults,
    validationResult,
    hallucinationRisks,
    stats: {
      blocks: totalBlocks,
      pages: imagePaths.length,
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
Usage: node src/pipeline.js <document.docx> [options]

Options:
  --verbose       Show detailed progress
  --page-limit N  Process only first N pages
  --output PATH   Output HTML file path
  --help          Show this help

Example:
  node src/pipeline.js ./document.docx --verbose --page-limit 2
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
    const result = await runPipeline(docxPath, {
      verbose,
      pageLimit,
      startPage,
      outputPath,
    });

    // Open output in browser
    console.log(`\nOpening output in browser...`);
    const outputFile = outputPath || 'src/output/pipeline-output.html';

    // Use dynamic import for open module or fallback to system command
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

export { runPipeline };
