'use server';

import { revalidatePath } from 'next/cache';
import * as summaries from '@/lib/summaries';
import type { SummaryCli, SummaryMode } from '@/lib/settings';

const refresh = () => revalidatePath('/', 'layout');

export async function approveSummary(ids: string | string[]) {
  await summaries.approve(ids);
  refresh();
}
export async function skipSummary(ids: string | string[]) {
  await summaries.skip(ids);
  refresh();
}
export async function alwaysSaveProject(projectRel: string) {
  await summaries.alwaysSave(projectRel);
  refresh();
}
export async function retrySummary(id: string) {
  await summaries.retry(id);
  refresh();
}
export async function configureSummaries(patch: { default?: SummaryMode; cli?: SummaryCli; start?: boolean }) {
  if (patch.default && !['off', 'ask', 'auto'].includes(patch.default)) throw new Error('Unknown mode.');
  if (patch.cli && !['claude', 'codex'].includes(patch.cli)) throw new Error('Unknown CLI.');
  await summaries.configure(patch);
  refresh();
}
