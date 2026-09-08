import * as React from 'npm:react@18.3.1';
import { renderToStaticMarkup } from 'npm:react-dom@18.3.1/server';
import { getTemplate } from './registry.ts';
import type { TemplateName } from './registry.ts';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// renderToStaticMarkup (not @react-email/render's own render()) is used
// deliberately — confirmed empirically that both produce identical,
// correct HTML, but @react-email/render leaves the Deno process unable to
// exit on its own afterward. That's harmless for Deno.serve (an Edge
// Function is a long-running server, not a script that's expected to
// terminate), but renderToStaticMarkup is the simpler, lower-risk surface
// with no such behavior observed, so it's the one actually used here.
export function renderTemplate(name: TemplateName, rawVariables: Record<string, unknown>): RenderedEmail {
  const template = getTemplate(name);
  const variables = template.parseVariables(rawVariables);
  const element = React.createElement(template.Email, variables);
  const html = '<!DOCTYPE html>' + renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0]);

  return {
    subject: template.subject(variables),
    html,
    text: template.toPlainText(variables),
  };
}
