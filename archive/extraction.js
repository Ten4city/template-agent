/**
 * Text Extraction Module
 *
 * Extracts text blocks from Word documents using Mammoth + Cheerio.
 * Each block has both raw text and preserved HTML for formatting.
 */

import mammoth from "mammoth";
import fs from "fs";
import * as cheerio from "cheerio";

/**
 * Extract text blocks from a Word document
 * @param {string} docxPath - Path to .docx file
 * @returns {Promise<{blocks: Array, rawHtml: string, warnings: Array}>}
 */
export async function extractTextBlocks(docxPath) {
  const buffer = fs.readFileSync(docxPath);

  // Convert to HTML preserving basic formatting
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value;

  // Parse HTML into blocks
  const blocks = parseHtmlToBlocks(html);

  return {
    blocks,
    rawHtml: html,
    warnings: result.messages.filter((m) => m.type === "warning"),
  };
}

/**
 * Parse Mammoth HTML output into text blocks
 * Preserves both raw text and HTML for each block
 */
function parseHtmlToBlocks(html) {
  const $ = cheerio.load(html);
  const blocks = [];
  let index = 0;

  // Process block-level elements in document order
  $("p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote").each((_, el) => {
    const $el = $(el);
    const tag = el.tagName.toLowerCase();

    // Get text content
    let text;
    if (tag === "li") {
      // For list items, exclude nested lists
      const $clone = $el.clone();
      $clone.find("ul, ol").remove();
      text = $clone.text().trim();
    } else {
      text = $el.text().trim();
    }

    // Normalize whitespace
    text = text.replace(/\s+/g, " ");

    // Get inner HTML (preserves <strong>, <em>, <u>, etc.)
    const innerHtml = $el.html();

    if (text) {
      blocks.push({
        index: index++,
        type: getBlockType(tag),
        text: text,
        html: innerHtml,
        tag: tag,
      });
    }
  });

  return blocks;
}

/**
 * Map HTML tag to semantic block type
 */
function getBlockType(tag) {
  if (tag.startsWith("h") && tag.length === 2) {
    return `heading${tag[1]}`;
  }
  switch (tag) {
    case "li":
      return "list-item";
    case "td":
    case "th":
      return "table-cell";
    case "blockquote":
      return "blockquote";
    default:
      return "paragraph";
  }
}

/**
 * Format blocks for display/debugging
 */
export function formatBlocksForDisplay(blocks, maxPreview = 60) {
  return blocks
    .map((b) => {
      const preview =
        b.text.length > maxPreview
          ? b.text.substring(0, maxPreview) + "..."
          : b.text;
      return `[${b.index}] (${b.type}) ${preview}`;
    })
    .join("\n");
}

/**
 * Search blocks for matching content
 * Used by the search_block tool
 */
export function searchBlocks(blocks, hint, searchType = "fuzzy") {
  if (!hint) return { found: false, error: "No hint provided" };

  const normalize = (s) =>
    s
      .replace(/^[^a-zA-Z0-9]+/, "")
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .trim();

  const hintNorm = normalize(hint);
  const hintWords = hintNorm.split(/\s+/).filter((w) => w.length > 2).slice(0, 8);

  if (hintWords.length === 0) {
    return { found: false, error: "Hint too short after normalization" };
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const block of blocks) {
    const blockNorm = normalize(block.text);
    if (blockNorm.length < 5) continue;

    // Prefix match - highest priority
    if (searchType === "prefix" || searchType === "fuzzy") {
      if (blockNorm.startsWith(hintNorm.substring(0, 30))) {
        return {
          found: true,
          index: block.index,
          preview: block.text.substring(0, 100) + (block.text.length > 100 ? "..." : ""),
          matchType: "prefix",
        };
      }
    }

    // Contains match
    if (searchType === "contains" || searchType === "fuzzy") {
      if (blockNorm.includes(hintNorm)) {
        return {
          found: true,
          index: block.index,
          preview: block.text.substring(0, 100) + (block.text.length > 100 ? "..." : ""),
          matchType: "contains",
        };
      }
    }

    // Fuzzy word overlap
    if (searchType === "fuzzy") {
      const blockWords = blockNorm.split(/\s+/);
      let score = 0;
      for (const hintWord of hintWords) {
        if (blockWords.some((bw) => bw.includes(hintWord) || hintWord.includes(bw))) {
          score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = block;
      }
    }
  }

  // Check if best fuzzy match is good enough
  const threshold = hintWords.length * 0.5;
  if (bestMatch && bestScore >= threshold) {
    return {
      found: true,
      index: bestMatch.index,
      preview: bestMatch.text.substring(0, 100) + (bestMatch.text.length > 100 ? "..." : ""),
      matchType: "fuzzy",
      score: `${bestScore}/${hintWords.length}`,
    };
  }

  return {
    found: false,
    hint: hint,
    message: "No matching block found",
  };
}
