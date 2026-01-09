/**
 * Vision HTML Agent v2 - Main Entry Point
 *
 * Full pipeline: DOCX → Image → Claude Vision → HTML
 *
 * Usage:
 *   node index.js <docx-file>           # Process Word document
 *   node index.js --image <image-file>  # Process single image (no text blocks)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load .env file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join("=").trim();
    }
  }
}
import { renderDocxToImages } from "./render.js";
import { extractTextBlocks, formatBlocksForDisplay } from "./extraction.js";
import { runAgent, runAgentMultiPage } from "./agent.js";

/**
 * Process a Word document end-to-end
 *
 * @param {string} docxPath - Path to .docx file
 * @param {Object} options - Processing options
 * @returns {Promise<{html: string, outputPath: string}>}
 */
export async function processDocument(docxPath, options = {}) {
  const {
    outputDir,
    verbose = true,
    model, // Let agent.js handle provider-specific defaults
    pageLimit // Process only first N pages (for testing)
  } = options;

  const startTime = Date.now();

  if (verbose) console.log(`\n📄 Processing: ${path.basename(docxPath)}\n`);

  // Step 1: Extract text blocks from Word document
  if (verbose) console.log("Step 1: Extracting text blocks...");
  const { blocks, warnings } = await extractTextBlocks(docxPath);
  if (verbose) {
    console.log(`  Found ${blocks.length} text blocks`);
    if (warnings.length > 0) {
      console.log(`  Warnings: ${warnings.map(w => w.message).join(", ")}`);
    }
  }

  // Step 2: Render document to images
  if (verbose) console.log("\nStep 2: Rendering to images...");
  const { imagePaths } = await renderDocxToImages(docxPath, outputDir);
  if (verbose) console.log(`  Created ${imagePaths.length} page image(s)`);

  // Apply page limit if specified
  const pagesToProcess = pageLimit ? imagePaths.slice(0, pageLimit) : imagePaths;

  // Step 3: Run agent on each page
  if (verbose) console.log(`\nStep 3: Running agent on ${pagesToProcess.length} page(s)...`);

  let result;
  if (pagesToProcess.length === 1) {
    result = await runAgent(pagesToProcess[0], blocks, { model, verbose });
    result = { html: result.html, pageResults: [result] };
  } else {
    result = await runAgentMultiPage(pagesToProcess, blocks, { model, verbose });
  }

  // Step 4: Save output
  const outputBaseName = path.basename(docxPath, path.extname(docxPath));
  const outputPath = path.join(
    outputDir || path.dirname(docxPath),
    `${outputBaseName}-output.html`
  );

  // Wrap in basic HTML structure
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${outputBaseName}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.4;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    table { margin-bottom: 0; }
    p { margin: 0.5em 0; }
    .leegality-textbox, .leegality-textarea {
      border: none;
      border-bottom: 1px solid #000;
      background: transparent;
      padding: 2px 4px;
    }
    .leegality-checkbox, .leegality-radio {
      margin-right: 4px;
    }
    .image-placeholder {
      background: #f0f0f0;
      border: 1px dashed #999;
    }
  </style>
</head>
<body>
${result.html}
</body>
</html>`;

  fs.writeFileSync(outputPath, fullHtml);
  if (verbose) console.log(`\n✅ Output saved: ${outputPath}`);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  if (verbose) {
    console.log(`\n📊 Summary:`);
    console.log(`  - Text blocks: ${blocks.length}`);
    console.log(`  - Pages processed: ${pagesToProcess.length}`);
    console.log(`  - Total iterations: ${result.pageResults.reduce((sum, p) => sum + p.iterations, 0)}`);
    console.log(`  - Output size: ${result.html.length} chars`);
    console.log(`  - Time: ${duration}s`);
  }

  return {
    html: result.html,
    outputPath,
    blocks,
    pageResults: result.pageResults
  };
}

/**
 * Process a single image (for testing without Word document)
 *
 * @param {string} imagePath - Path to image file
 * @param {Array} textBlocks - Text blocks to use (optional)
 * @param {Object} options - Processing options
 */
export async function processImage(imagePath, textBlocks = [], options = {}) {
  const { verbose = true, model } = options;

  if (verbose) console.log(`\n🖼️ Processing image: ${path.basename(imagePath)}\n`);

  const result = await runAgent(imagePath, textBlocks, { model, verbose });

  // Save output next to image
  const outputPath = imagePath.replace(/\.[^.]+$/, "-output.html");

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Agent Output</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.4;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
  </style>
</head>
<body>
${result.html}
</body>
</html>`;

  fs.writeFileSync(outputPath, fullHtml);
  if (verbose) console.log(`\n✅ Output saved: ${outputPath}`);

  return { ...result, outputPath };
}

// CLI interface
if (process.argv[1].endsWith("index.js")) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Vision HTML Agent v2
====================

Usage:
  node index.js <docx-file>                    Process Word document
  node index.js --image <image-file>           Process single image
  node index.js --page-limit N <docx-file>     Process first N pages only

Options:
  --image         Process a single image instead of Word document
  --page-limit N  Only process first N pages (for testing)
  --quiet         Reduce output verbosity

Examples:
  node index.js document.docx
  node index.js --page-limit 1 long-document.docx
  node index.js --image page-1.png
`);
    process.exit(0);
  }

  // Parse arguments
  let inputPath = null;
  let isImage = false;
  let pageLimit = null;
  let verbose = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--image") {
      isImage = true;
    } else if (args[i] === "--page-limit") {
      pageLimit = parseInt(args[++i]);
    } else if (args[i] === "--quiet") {
      verbose = false;
    } else if (!args[i].startsWith("--")) {
      inputPath = args[i];
    }
  }

  if (!inputPath) {
    console.error("Error: No input file specified");
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  // Run appropriate processor
  const run = async () => {
    try {
      if (isImage) {
        await processImage(inputPath, [], { verbose });
      } else {
        await processDocument(inputPath, { verbose, pageLimit });
      }
    } catch (err) {
      console.error(`\n❌ Error: ${err.message}`);
      if (verbose) console.error(err.stack);
      process.exit(1);
    }
  };

  run();
}
