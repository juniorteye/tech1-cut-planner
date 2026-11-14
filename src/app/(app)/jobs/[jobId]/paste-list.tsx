"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { parsePastedList, type PastedLine } from "@/lib/paste";
import type { DisplayUnit } from "@/lib/types";
import { formatLength } from "@/lib/units";
import { addPastedPieces } from "../actions";
import { EDGE_PRESETS } from "./piece-fields";

const presetCounts = EDGE_PRESETS.map((preset) => ({
  label: preset.label,
  bandedLengths: Number(preset.edges.left) + Number(preset.edges.right),
  bandedWidths: Number(preset.edges.top) + Number(preset.edges.bottom),
}));

/**
 * A box to paste a whole list in his own format, one part per line, then a
 * table to check before anything is saved. Edges start at None and can be
 * set per line. Lines that cannot be read are shown in red and must be fixed
 * or deliberately left out; they are never skipped quietly.
 */
export function PasteList({
  jobId,
  sectionId,
  unit,
  banding,
}: {
  jobId: string;
  sectionId: string;
  unit: DisplayUnit;
  banding: boolean;
}) {
  const [text, setText] = useState("");
  const [lines, setLines] = useState<PastedLine[] | null>(null);
  const [edges, setEdges] = useState<Record<number, number>>({});
  const [leaveOut, setLeaveOut] = useState(false);

  const good = (lines ?? []).filter((line) => line.ok);
  const bad = (lines ?? []).filter((line) => !line.ok);
  const parts = good.reduce((sum, line) => sum + line.quantity, 0);
  const ready = good.length > 0 && (bad.length === 0 || leaveOut);
  const rows = good.map((line) => {
    const preset = presetCounts[edges[line.line] ?? 0];
    return {
      widthMm: line.widthMm,
      lengthMm: line.lengthMm,
      quantity: line.quantity,
      name: line.name,
      bandedLengths: banding ? preset.bandedLengths : 0,
      bandedWidths: banding ? preset.bandedWidths : 0,
    };
  });

  return (
    <div className="mt-3 space-y-3">
      <label className="block">
        <span className="text-sm font-semibold">One part per line: width × length – how many</span>
        <textarea
          name="pasted"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setLines(null);
          }}
          rows={6}
          placeholder={"35 x 260 - 6 pcs\n35x210-7\n16.4 x 35 - 4"}
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 font-mono text-base"
        />
      </label>
      <button
        type="button"
        onClick={() => {
          setLines(parsePastedList(text, unit));
          setEdges({});
          setLeaveOut(false);
        }}
        className="min-h-10 rounded-md px-4 font-semibold ring-1 ring-line"
      >
        Read the list
      </button>

      {lines && lines.length === 0 && <p className="text-sm text-muted">There is nothing to read yet.</p>}
      {lines && lines.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="font-mono text-xs uppercase text-muted">
                <tr>
                  <th className="py-1 pr-2">Line</th>
                  <th className="py-1 pr-2">Width</th>
                  <th className="py-1 pr-2">Length</th>
                  <th className="py-1 pr-2">Qty</th>
                  {banding && <th className="py-1 pr-2">Edges</th>}
                  <th className="py-1">Name</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) =>
                  line.ok ? (
                    <tr key={line.line} className="border-t border-line">
                      <td className="py-1.5 pr-2 text-muted">{line.line}</td>
                      <td className="whitespace-nowrap py-1.5 pr-2 font-mono">{formatLength(line.widthMm, unit)}</td>
                      <td className="whitespace-nowrap py-1.5 pr-2 font-mono">{formatLength(line.lengthMm, unit)}</td>
                      <td className="py-1.5 pr-2">{line.quantity}</td>
                      {banding && (
                        <td className="py-1 pr-2">
                          <select
                            aria-label={`Edges for line ${line.line}`}
                            value={edges[line.line] ?? 0}
                            onChange={(event) => setEdges({ ...edges, [line.line]: Number(event.target.value) })}
                            className="min-h-10 rounded-md border border-line bg-white px-2 text-base"
                          >
                            {presetCounts.map((preset, index) => (
                              <option key={preset.label} value={index}>
                                {preset.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td className="py-1.5">{line.name}</td>
                    </tr>
                  ) : (
                    <tr key={line.line} className="border-t border-red-300 bg-red-50 text-red-800" data-unread>
                      <td className="py-1.5 pr-2 font-semibold">{line.line}</td>
                      <td colSpan={banding ? 5 : 4} className="py-1.5">
                        <span className="font-mono">{line.text}</span>
                        <span className="block text-xs font-semibold">Can&apos;t read this line: {line.reason}.</span>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          {bad.length > 0 && (
            <label className="flex min-h-10 items-center gap-2 text-sm font-semibold text-red-800">
              <input type="checkbox" className="size-5" checked={leaveOut} onChange={(event) => setLeaveOut(event.target.checked)} />
              Leave out the {bad.length === 1 ? "line" : `${bad.length} lines`} I can&apos;t read, or fix {bad.length === 1 ? "it" : "them"} above and read again
            </label>
          )}

          <ActionForm
            action={addPastedPieces}
            submitLabel={`Add ${parts} ${parts === 1 ? "part" : "parts"}`}
            pendingLabel="Adding…"
            disabled={!ready}
            onSaved={() => {
              setText("");
              setLines(null);
              setEdges({});
              setLeaveOut(false);
            }}
          >
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="sectionId" value={sectionId} />
            <input type="hidden" name="rows" value={JSON.stringify(rows)} />
          </ActionForm>
        </>
      )}
    </div>
  );
}
