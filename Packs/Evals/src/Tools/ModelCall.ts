#!/usr/bin/env bun
/**
 * Local model-call primitive for Evals.
 *
 * Keeps Evals self-contained instead of importing the legacy PAI/TOOLS layer.
 */

import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

export type InferenceLevel = 'fast' | 'standard' | 'smart';

export interface ModelCallOptions {
  systemPrompt: string;
  userPrompt: string;
  level?: InferenceLevel;
  timeout?: number;
  model?: string;
}

export interface ModelCallResult {
  success: boolean;
  output: string;
  error?: string;
}

const DEFAULT_MODELS: Record<InferenceLevel, string> = {
  fast: process.env.EVALS_MODEL_FAST ?? 'claude-haiku-4-5-20251001',
  standard: process.env.EVALS_MODEL_STANDARD ?? 'claude-sonnet-4-6',
  smart: process.env.EVALS_MODEL_SMART ?? 'claude-opus-4-6',
};

export async function modelCall(options: ModelCallOptions): Promise<ModelCallResult> {
  const level = options.level ?? 'standard';
  const model = options.model ?? DEFAULT_MODELS[level];
  const timeout = options.timeout ?? 60_000;
  const controller = new AbortController();
  const timer = timeout > 0
    ? setTimeout(() => controller.abort(), timeout)
    : undefined;

  try {
    const result = await generateText({
      model: anthropic(model),
      system: options.systemPrompt,
      prompt: options.userPrompt,
      abortSignal: controller.signal,
    });

    return {
      success: true,
      output: result.text,
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
