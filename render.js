/**
 * Document Rendering Module
 *
 * Converts Word documents to page images for vision input.
 * Pipeline: DOCX → PDF (LibreOffice) → PNG (pdftocairo)
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

// Use environment variables with platform-specific defaults
const SOFFICE_PATH = process.env.SOFFICE_PATH ||
  (process.platform === 'darwin'
    ? "/Applications/LibreOffice.app/Contents/MacOS/soffice"
    : "/usr/bin/soffice");
const PDFTOCAIRO_PATH = process.env.PDFTOCAIRO_PATH ||
  (process.platform === 'darwin'
    ? "/opt/homebrew/bin/pdftocairo"
    : "/usr/bin/pdftocairo");

/**
 * Convert Word document to PDF using LibreOffice
 * @param {string} docxPath - Path to .docx file
 * @param {string} outputDir - Directory to save PDF
 * @returns {Promise<string>} - Path to generated PDF
 */
async function docxToPdf(docxPath, outputDir) {
  const absoluteDocx = path.resolve(docxPath);
  const absoluteOutput = path.resolve(outputDir);

  if (!fs.existsSync(absoluteOutput)) {
    fs.mkdirSync(absoluteOutput, { recursive: true });
  }

  const command = `"${SOFFICE_PATH}" --headless --convert-to pdf --outdir "${absoluteOutput}" "${absoluteDocx}"`;

  try {
    await execAsync(command);
  } catch (error) {
    throw new Error(`LibreOffice conversion failed: ${error.message}`);
  }

  const baseName = path.basename(docxPath, path.extname(docxPath));
  const pdfPath = path.join(absoluteOutput, `${baseName}.pdf`);

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not created at expected path: ${pdfPath}`);
  }

  return pdfPath;
}

/**
 * Convert PDF pages to PNG images using pdftocairo
 * @param {string} pdfPath - Path to PDF file
 * @param {string} outputDir - Directory to save images
 * @returns {Promise<string[]>} - Array of paths to generated images
 */
async function pdfToImages(pdfPath, outputDir) {
  const absolutePdf = path.resolve(pdfPath);
  const absoluteOutput = path.resolve(outputDir);

  if (!fs.existsSync(absoluteOutput)) {
    fs.mkdirSync(absoluteOutput, { recursive: true });
  }

  const baseName = path.basename(pdfPath, ".pdf");
  const outputPrefix = path.join(absoluteOutput, baseName);

  // -png: output PNG format
  // -r 200: 200 DPI resolution (good balance of quality and size)
  const command = `"${PDFTOCAIRO_PATH}" -png -r 200 "${absolutePdf}" "${outputPrefix}"`;

  try {
    await execAsync(command);
  } catch (error) {
    throw new Error(`PDF to image conversion failed: ${error.message}`);
  }

  const files = fs.readdirSync(absoluteOutput);
  const images = files
    .filter((f) => f.startsWith(baseName) && f.endsWith(".png"))
    .sort((a, b) => {
      const numA = parseInt(a.match(/-(\d+)\.png$/)?.[1] || "0");
      const numB = parseInt(b.match(/-(\d+)\.png$/)?.[1] || "0");
      return numA - numB;
    })
    .map((f) => path.join(absoluteOutput, f));

  return images;
}

/**
 * Convert Word document to page images
 * @param {string} docxPath - Path to .docx file
 * @param {string} [outputDir] - Optional output directory
 * @returns {Promise<{pdfPath: string, imagePaths: string[]}>}
 */
export async function renderDocxToImages(docxPath, outputDir) {
  const absoluteDocx = path.resolve(docxPath);

  if (!outputDir) {
    const docxDir = path.dirname(absoluteDocx);
    const baseName = path.basename(docxPath, path.extname(docxPath));
    outputDir = path.join(docxDir, `${baseName}-render`);
  }

  console.log(`Converting ${path.basename(docxPath)} to images...`);

  console.log("  Step 1: Converting to PDF...");
  const pdfPath = await docxToPdf(absoluteDocx, outputDir);
  console.log(`  PDF created: ${pdfPath}`);

  console.log("  Step 2: Converting to images...");
  const imagePaths = await pdfToImages(pdfPath, outputDir);
  console.log(`  Created ${imagePaths.length} page image(s)`);

  return { pdfPath, imagePaths };
}

/**
 * Convert PDF directly to page images
 * @param {string} pdfPath - Path to PDF file
 * @param {string} [outputDir] - Optional output directory
 * @returns {Promise<{pdfPath: string, imagePaths: string[]}>}
 */
export async function renderPdfToImages(pdfPath, outputDir) {
  const absolutePdf = path.resolve(pdfPath);

  if (!outputDir) {
    const pdfDir = path.dirname(absolutePdf);
    const baseName = path.basename(pdfPath, '.pdf');
    outputDir = path.join(pdfDir, `${baseName}-render`);
  }

  console.log(`Converting ${path.basename(pdfPath)} to images...`);

  const imagePaths = await pdfToImages(absolutePdf, outputDir);
  console.log(`  Created ${imagePaths.length} page image(s)`);

  return { pdfPath: absolutePdf, imagePaths };
}

/**
 * Load image as base64 for Claude vision
 * @param {string} imagePath - Path to image file
 * @returns {{type: string, media_type: string, data: string}}
 */
export function loadImageAsBase64(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  const base64 = buffer.toString("base64");
  const ext = path.extname(imagePath).toLowerCase();

  const mimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp"
  };

  return {
    type: "base64",
    media_type: mimeTypes[ext] || "image/png",
    data: base64
  };
}

// CLI for testing
if (process.argv[1]?.endsWith("render.js")) {
  const docxPath = process.argv[2];

  if (!docxPath) {
    console.log("Usage: node render.js <docx-file>");
    process.exit(1);
  }

  if (!fs.existsSync(docxPath)) {
    console.error(`File not found: ${docxPath}`);
    process.exit(1);
  }

  renderDocxToImages(docxPath)
    .then(({ pdfPath, imagePaths }) => {
      console.log("\nConversion complete!");
      console.log(`PDF: ${pdfPath}`);
      console.log(`Images: ${imagePaths.join(", ")}`);
    })
    .catch((err) => {
      console.error("Conversion failed:", err.message);
      process.exit(1);
    });
}
