/**
 * Field Detector
 *
 * Uses Gemini to detect fillable form fields in a page image
 * given the existing structure.
 */

import { VertexAI } from '@google-cloud/vertexai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  FIELD_DETECTION_SYSTEM_PROMPT,
  FIELD_DETECTION_TOOLS,
  buildFieldDetectionPrompt,
} from './prompt-field-detection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = '/Users/ritik/Downloads/internal-operations-461404-316ec7fe1406 (3).json';

/**
 * Convert tool definitions to Gemini function declarations
 */
function convertToolsToGemini(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  }));
}

/**
 * Create Gemini client with Vertex AI
 */
function createGeminiClient() {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountPath;
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

  return new VertexAI({
    project: serviceAccount.project_id,
    location: 'us-central1',
  });
}

/**
 * Detect fields in a single page
 *
 * @param {string} imagePath - Path to the page image
 * @param {Object} pageStructure - Existing structure for this page
 * @param {Object} options - Detection options
 * @returns {Promise<Object>} Detection result with fields array
 */
export async function detectPageFields(imagePath, pageStructure, options = {}) {
  const { model = 'gemini-2.5-pro', verbose = false, maxIterations = 5 } = options;

  const vertexAI = createGeminiClient();

  const generativeModel = vertexAI.getGenerativeModel({
    model,
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.1,
    },
    tools: [
      {
        functionDeclarations: convertToolsToGemini(FIELD_DETECTION_TOOLS),
      },
    ],
    systemInstruction: FIELD_DETECTION_SYSTEM_PROMPT,
  });

  // Load image as base64
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  // Build user prompt
  const userPrompt = buildFieldDetectionPrompt(pageStructure);

  // Initial message with image and prompt
  const initialContent = [
    {
      inlineData: {
        mimeType,
        data: imageBase64,
      },
    },
    {
      text: userPrompt,
    },
  ];

  if (verbose) {
    console.log(`[FieldDetector] Starting detection for page ${pageStructure.pageNumber}`);
    console.log(`[FieldDetector] Elements in structure: ${pageStructure.elements?.length || 0}`);
  }

  // Start chat session
  const chat = generativeModel.startChat({ history: [] });

  let iterations = 0;
  let detectedFields = null;

  // Send initial message
  let response = await chat.sendMessage(initialContent);

  while (iterations < maxIterations) {
    iterations++;

    const candidate = response.response.candidates?.[0];
    if (!candidate) {
      if (verbose) console.log('[FieldDetector] No candidate in response');
      break;
    }

    const content = candidate.content;
    const parts = content.parts || [];

    // Check for function calls
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length === 0) {
      if (candidate.finishReason === 'STOP') {
        if (verbose) console.log('[FieldDetector] Model stopped');
        break;
      }

      // Prompt to continue
      response = await chat.sendMessage([
        { text: 'Output the detected fields using the output_fields tool.' },
      ]);
      continue;
    }

    // Execute function calls
    const functionResponses = [];

    for (const part of functionCalls) {
      const fc = part.functionCall;
      const toolName = fc.name;
      const toolArgs = fc.args || {};

      if (verbose) {
        console.log(`  [${iterations}] ${toolName}: ${toolArgs.fields?.length || 0} fields`);
      }

      if (toolName === 'output_fields') {
        detectedFields = toolArgs.fields || [];

        // Validate fields
        const validation = validateFields(detectedFields, pageStructure);

        if (validation.valid) {
          functionResponses.push({
            functionResponse: {
              name: toolName,
              response: { success: true, message: 'Fields accepted' },
            },
          });
          if (verbose) {
            console.log(`  [${iterations}] ${detectedFields.length} fields accepted`);
          }
        } else {
          functionResponses.push({
            functionResponse: {
              name: toolName,
              response: {
                success: false,
                message: 'Fields rejected',
                errors: validation.errors,
              },
            },
          });
          detectedFields = null; // Reset to retry
          if (verbose) {
            console.log(`  [${iterations}] Fields rejected: ${validation.errors.join(', ')}`);
          }
        }
      } else {
        functionResponses.push({
          functionResponse: {
            name: toolName,
            response: { error: `Unknown tool: ${toolName}` },
          },
        });
      }
    }

    // Send function responses
    response = await chat.sendMessage(functionResponses);

    // If we got valid fields, we're done
    if (detectedFields) {
      break;
    }
  }

  if (verbose) {
    console.log(`[FieldDetector] Completed in ${iterations} iterations`);
    console.log(`[FieldDetector] Detected ${detectedFields?.length || 0} fields`);
  }

  return {
    fields: detectedFields || [],
    iterations,
    success: detectedFields !== null,
  };
}

/**
 * Validate detected fields
 */
function validateFields(fields, pageStructure) {
  const errors = [];

  if (!Array.isArray(fields)) {
    errors.push('fields must be an array');
    return { valid: false, errors };
  }

  const validTypes = ['textbox', 'email', 'tel', 'date', 'number', 'checkbox', 'radio', 'textarea', 'image'];
  const elementCount = pageStructure.elements?.length || 0;

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];

    // Check required properties
    if (field.elementIndex === undefined) {
      errors.push(`Field ${i}: missing elementIndex`);
      continue;
    }

    if (!field.type) {
      errors.push(`Field ${i}: missing type`);
      continue;
    }

    if (!field.name) {
      errors.push(`Field ${i}: missing name`);
      continue;
    }

    // Validate elementIndex is in range
    if (field.elementIndex < 0 || field.elementIndex >= elementCount) {
      errors.push(`Field ${i}: elementIndex ${field.elementIndex} out of range (0-${elementCount - 1})`);
    }

    // Validate type
    if (!validTypes.includes(field.type)) {
      errors.push(`Field ${i}: invalid type "${field.type}"`);
    }

    // Validate options for checkbox/radio
    if ((field.type === 'checkbox' || field.type === 'radio') && field.options) {
      if (!Array.isArray(field.options)) {
        errors.push(`Field ${i}: options must be an array`);
      } else {
        for (let j = 0; j < field.options.length; j++) {
          const opt = field.options[j];
          if (!opt.value || !opt.label) {
            errors.push(`Field ${i}, option ${j}: missing value or label`);
          }
        }
      }
    }

    // Validate location for table fields
    const element = pageStructure.elements?.[field.elementIndex];
    if (element?.type === 'table' && field.location) {
      const rowCount = element.rows?.length || 0;
      if (field.location.row < 0 || field.location.row >= rowCount) {
        errors.push(`Field ${i}: row ${field.location.row} out of range (0-${rowCount - 1})`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
