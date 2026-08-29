import { useT } from "@/lib/i18n";
import { Section, ToggleRow } from "../shared";
import { ChipMulti, ChoiceRow, StepRow } from "./controls";
import { readNumber, readRow, type TvDoc, type TvGroup, type TvRow } from "./model";
import { writeTvValue } from "./store";

const ORDERED_KEYS = new Set(["audioLang", "subLang"]);

function lockOf(group: TvGroup, row: TvRow, doc: TvDoc): string | undefined {
  if (group.id !== "episodes") return undefined;
  if (!row.key.startsWith("spoiler")) return undefined;
  const armed = readRow(doc, { kind: "toggle", key: "hideSpoilers", label: "", def: false });
  return armed === true ? undefined : "Turn on Hide spoilers to use this";
}

export function TvRowControl({
  group,
  row,
  doc,
  profileId,
}: {
  group: TvGroup;
  row: TvRow;
  doc: TvDoc;
  profileId: string;
}) {
  const t = useT();
  const set = (v: boolean | string | string[]) =>
    writeTvValue(profileId, group.wire, row.key, v);

  if (row.kind === "toggle") {
    return (
      <ToggleRow
        label={t(row.label)}
        sub={row.sub ? t(row.sub) : undefined}
        value={readRow(doc, row) === true}
        onChange={set}
        lockReason={lockOf(group, row, doc)}
        newId={row.newId}
      />
    );
  }
  if (row.kind === "choice") {
    const value = readRow(doc, row);
    return (
      <ChoiceRow
        label={row.label}
        sub={row.sub}
        tvOnly={row.tvOnly}
        newId={row.newId}
        value={typeof value === "string" ? value : row.def}
        options={row.options}
        onChange={set}
      />
    );
  }
  if (row.kind === "multi") {
    const value = readRow(doc, row);
    return (
      <ChipMulti
        label={row.label}
        sub={row.sub}
        tvOnly={row.tvOnly}
        newId={row.newId}
        value={Array.isArray(value) ? value : row.def}
        options={row.options}
        onChange={set}
        ordered={ORDERED_KEYS.has(row.key)}
      />
    );
  }
  return (
    <StepRow
      label={row.label}
      sub={row.sub}
      tvOnly={row.tvOnly}
      newId={row.newId}
      value={readNumber(doc, row)}
      min={row.min}
      max={row.max}
      step={row.step}
      unit={row.unit}
      onChange={(v) => set(String(v))}
    />
  );
}

export function TvGroupSection({
  group,
  doc,
  profileId,
  newId,
  children,
}: {
  group: TvGroup;
  doc: TvDoc;
  profileId: string;
  newId?: string;
  children?: React.ReactNode;
}) {
  return (
    <Section title={group.title} subtitle={group.subtitle} newId={newId}>
      {children}
      {group.rows.map((row) => (
        <TvRowControl key={row.key} group={group} row={row} doc={doc} profileId={profileId} />
      ))}
    </Section>
  );
}
