import { createNote } from '@gida-concept/pm-agent-core';
import { getCommandContext, closeCommandContext, outputJson, shouldOutputJson } from '../db-utils.js';
import { Colors, formatCard } from '../formatters.js';

export async function noteCommand(content: string, opts: Record<string, any>): Promise<void> {
  const ctx = getCommandContext(opts);

  try {
    const note = createNote(ctx.db, {
      content,
      tags: opts.tag || [],
      links: opts.link || [],
    });

    if (shouldOutputJson(opts)) {
      outputJson(note, opts);
    } else {
      console.log(Colors.success(`Note ${Colors.highlight(note.id)} created.`));
      if (note.tags.length > 0) {
        console.log(Colors.muted(`Tags: ${note.tags.join(', ')}`));
      }
    }
  } finally {
    closeCommandContext(ctx);
  }
}
