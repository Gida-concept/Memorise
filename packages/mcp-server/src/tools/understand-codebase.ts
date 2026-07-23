import { getConfigAndDb } from './db-utils.js';
import { semanticScan } from '@gida-concept/pm-agent-core';
import { closeDb } from '@gida-concept/pm-agent-core';

export async function handleUnderstandCodebase(_args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { config, db } = getConfigAndDb();

  try {
    const root = config.project.root;

    // Run semantic scan
    const result = await semanticScan(db, root);

    if (result.summaryCount === 0) {
      return {
        status: 'empty',
        message: 'No files in registry. Run pm_scan_codebase first.',
        projectMap: result.projectMap,
      };
    }

    return {
      status: 'completed',
      summaryCount: result.summaryCount,
      projectMap: result.projectMap,
    };
  } finally {
    closeDb(db);
  }
}
