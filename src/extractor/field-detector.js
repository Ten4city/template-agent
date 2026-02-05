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

// Service account: from GOOGLE_CREDENTIALS env var (JSON string) or file path
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || './service-account.json';

// Cache for service account
let serviceAccount = null;

/**
 * Get service account data
 */
function getServiceAccount() {
  if (!serviceAccount) {
    if (process.env.GOOGLE_CREDENTIALS) {
      serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } else {
      serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
    }
  }
  return serviceAccount;
}

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
  if (!process.env.GOOGLE_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = SERVICE_ACCOUNT_PATH;
  }

  const sa = getServiceAccount();

  return new VertexAI({
    project: sa.project_id,
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
    console.log(`[FieldDetector] Model: ${model}`);
    console.log(`[FieldDetector] Elements in structure: ${pageStructure.elements?.length || 0}`);
    console.log(`[FieldDetector] User prompt:\n${userPrompt.substring(0, 500)}...`);
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
 * Validate detected fields (new format with injectionPoint)
 */
function validateFields(fields, pageStructure) {
  const errors = [];

  if (!Array.isArray(fields)) {
    errors.push('fields must be an array');
    return { valid: false, errors };
  }

  const validTypes = ['textbox', 'email', 'tel', 'date', 'number', 'checkbox', 'radio', 'textarea', 'image'];
  const validMethods = ['replace', 'insertAfter', 'insertBefore'];
  const elementCount = pageStructure.elements?.length || 0;

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];

    // Check required properties (new format)
    if (!field.fieldType) {
      errors.push(`Field ${i}: missing fieldType`);
      continue;
    }

    if (!field.fieldName) {
      errors.push(`Field ${i}: missing fieldName`);
      continue;
    }

    if (!field.injectionPoint) {
      errors.push(`Field ${i}: missing injectionPoint`);
      continue;
    }

    const { injectionPoint } = field;

    // Validate injectionPoint.method
    if (!injectionPoint.method || !validMethods.includes(injectionPoint.method)) {
      errors.push(`Field ${i}: invalid or missing method "${injectionPoint.method}"`);
    }

    // Validate injectionPoint.position
    if (!injectionPoint.position || injectionPoint.position.elementIndex === undefined) {
      errors.push(`Field ${i}: missing position.elementIndex`);
      continue;
    }

    const elementIndex = injectionPoint.position.elementIndex;

    // Validate elementIndex is in range
    if (elementIndex < 0 || elementIndex >= elementCount) {
      errors.push(`Field ${i}: elementIndex ${elementIndex} out of range (0-${elementCount - 1})`);
    }

    // Validate fieldType
    if (!validTypes.includes(field.fieldType)) {
      errors.push(`Field ${i}: invalid fieldType "${field.fieldType}"`);
    }

    // Validate options for checkbox/radio
    if ((field.fieldType === 'checkbox' || field.fieldType === 'radio') && field.options) {
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

    // Validate row/col for table fields
    const element = pageStructure.elements?.[elementIndex];
    if (element?.type === 'table' && injectionPoint.position.row !== undefined) {
      const rowCount = element.rows?.length || 0;
      if (injectionPoint.position.row < 0 || injectionPoint.position.row >= rowCount) {
        errors.push(`Field ${i}: row ${injectionPoint.position.row} out of range (0-${rowCount - 1})`);
      }
    }

    // Validate targetElementId for chained fields
    if (injectionPoint.method === 'insertAfter' && injectionPoint.targetElementId) {
      // Check that the referenced field exists earlier in the array
      const referencedField = fields.slice(0, i).find(f => f.fieldName === injectionPoint.targetElementId);
      if (!referencedField) {
        // This is a warning, not an error - the field might be from a previous detection
        console.warn(`Field ${i}: targetElementId "${injectionPoint.targetElementId}" not found in preceding fields`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
