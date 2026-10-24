import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { assessAdapterRepair } from './adapter-repair.js';
import { runRea } from './rea.js';
import { sha256, saveJson } from './workspace.js';
export async function assessWithEvidence(options) {
  const proposal = await assessAdapterRepair(options);
  if (proposal.status === 'blocked') return proposal;
  const root = proposal.directory,
    evidences = {};
  try {
    for (const side of ['reference', 'candidate']) {
      const analysis = side === 'reference' ? proposal.oldStructure : proposal.structure,
        s = await readFile(
          join(proposal[side].root, 'resources/app/out/vs/workbench/workbench.desktop.main.js'),
          'utf8'
        );
      if (sha256(s) !== analysis.sourceSha256) throw Error('Source changed during excerpt preparation');
      const dir = join(root, 'excerpts', side);
      await mkdir(dir, { recursive: true });
      const chunks = Object.fromEntries(
        Object.entries(analysis.ranges).map(([k, r]) => [
          k,
          { ...r, sha256: sha256(s.slice(r.start, r.end)), text: s.slice(r.start, r.end) }
        ])
      );
      const code =
        '// Analysis-only excerpts; labelled wrappers are newly written, never executed.\nconst ' +
        chunks.namespace.text +
        ';\nconst ' +
        chunks.broker.text +
        ';\n' +
        chunks.selection.text +
        ';\nexport class ThemeBindings{constructor(n,r,a){' +
        chunks.theme.text +
        '}}\n';
      await writeFile(join(dir, 'hooks.js'), code, { flag: 'wx' });
      await saveJson(join(dir, 'package.json'), {
        name: 'modkit-vscode-hook-excerpts',
        version: proposal[side].version,
        type: 'module',
        main: 'hooks.js'
      });
      await saveJson(join(dir, 'EXTRACTION.json'), {
        schema: 1,
        originalRoot: proposal[side].root,
        originalSourceSha256: analysis.sourceSha256,
        excerpts: chunks,
        generatedWrapperSha256: sha256(code),
        scope:
          'Exact source ranges with const/class wrappers for static analysis. No whole-app graph or executable reconstruction is claimed.'
      });
      evidences[side] = await runRea(
        [
          'analyze-javascript-application',
          dir,
          '--source-path',
          'hooks.js',
          '--max-semantic-nodes',
          '2000',
          '--max-semantic-unknowns',
          '1000',
          '--max-heap-mb',
          '512',
          '--analysis-timeout-ms',
          '30000'
        ],
        join(root, side + '-rea.json'),
        { timeoutMs: 60000, maxBytes: 8 * 1024 * 1024 }
      );
    }
    await saveJson(join(root, 'COMPARE-INPUT.json'), { left: evidences.reference, right: evidences.candidate });
    const comparison = await runRea(
      ['compare-application-versions', join(root, 'COMPARE-INPUT.json')],
      join(root, 'comparison-rea.json'),
      { timeoutMs: 60000, maxBytes: 8 * 1024 * 1024 }
    );
    const result = {
      schema: 1,
      status: 'recorded',
      scope:
        'REA compares authenticated graphs of the exact hook-excerpt analysis harnesses. Full bundle hashes/AST constraints and real-host acceptance are separate evidence. Unresolved comparison frontiers remain unknown.',
      evidenceIds: {
        reference: evidences.reference.evidence_id,
        candidate: evidences.candidate.evidence_id,
        comparison: comparison.evidence_id
      },
      comparisonFile: 'comparison-rea.json'
    };
    await saveJson(join(root, 'EVIDENCE.json'), result);
    return { ...proposal, evidence: result };
  } catch (e) {
    await saveJson(join(root, 'EVIDENCE.json'), {
      schema: 1,
      status: 'analysis-failed',
      error: e.message,
      scope: 'Candidate is not promoted; retained partial evidence remains explicitly incomplete.'
    });
    throw e;
  }
}
