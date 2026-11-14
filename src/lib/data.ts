import { redirect } from "next/navigation";
import { cache } from "react";
import type { JobPlan } from "./planner/types";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import type {
  Board,
  BoardType,
  Job,
  JobStatus,
  Leftover,
  LeftoverStatus,
  Material,
  Piece,
  QuoteMode,
  Section,
  TeamMember,
  TeamRole,
  Timber,
  Workshop,
} from "./types";

type Row = Record<string, unknown>;

function nullableNumber(value: unknown) {
  return value === null ? null : Number(value);
}

function toMaterial(row: Row): Material {
  const shared = {
    id: row.id as string,
    workshopId: row.workshop_id as string,
    name: row.name as string,
  };

  if (row.kind === "board") {
    const board: Board = {
      ...shared,
      kind: "board",
      boardType: row.board_type as BoardType,
      lengthMm: Number(row.length_mm),
      widthMm: Number(row.width_mm),
      thicknessMm: Number(row.thickness_mm),
      pricePerSheet: Number(row.price_per_sheet),
      edgeTrimMm: Number(row.edge_trim_mm),
      minLeftoverShortSideMm: Number(row.min_leftover_short_side_mm),
      minLeftoverAreaMm2: Number(row.min_leftover_area_mm2),
      bandingColour: (row.banding_colour as string | null) ?? (row.name as string),
      noBanding: row.no_banding === true,
    };
    return board;
  }

  const timber: Timber = {
    ...shared,
    kind: "timber",
    minLeftoverLengthMm: Number(row.min_leftover_length_mm),
    lengths: ((row.timber_lengths as Row[]) ?? [])
      .map((length) => ({
        lengthMm: Number(length.length_mm),
        pricePerPiece: Number(length.price_per_piece),
      }))
      .sort((a, b) => a.lengthMm - b.lengthMm),
  };
  return timber;
}

function toJob(row: Row): Job {
  return {
    id: row.id as string,
    workshopId: row.workshop_id as string,
    name: row.name as string,
    customer: row.customer as string,
    status: row.status as JobStatus,
    quoteMode: row.quote_mode as QuoteMode,
    wasteAllowancePercent: Number(row.waste_allowance_percent),
    copiedFromJobId: row.copied_from_job_id as string | null,
    sets: Number(row.sets ?? 1),
  };
}

function toSection(row: Row): Section {
  return {
    id: row.id as string,
    workshopId: row.workshop_id as string,
    jobId: row.job_id as string,
    name: row.name as string,
    materialId: row.material_id as string,
    position: Number(row.position),
  };
}

function toPiece(row: Row): Piece {
  return {
    id: row.id as string,
    workshopId: row.workshop_id as string,
    jobId: row.job_id as string,
    sectionId: (row.section_id as string | null) ?? null,
    materialId: row.material_id as string,
    name: row.name as string,
    lengthMm: Number(row.length_mm),
    widthMm: nullableNumber(row.width_mm),
    quantity: Number(row.quantity),
    grainLocked: row.grain_locked as boolean,
    bandedLengths: Number(row.banded_lengths ?? 0),
    bandedWidths: Number(row.banded_widths ?? 0),
  };
}

function toLeftover(row: Row): Leftover {
  return {
    id: row.id as string,
    workshopId: row.workshop_id as string,
    materialId: row.material_id as string,
    lengthMm: Number(row.length_mm),
    widthMm: nullableNumber(row.width_mm),
    status: row.status as LeftoverStatus,
    value: Number(row.value),
    sourceJobId: row.source_job_id as string | null,
    usedByJobId: row.used_by_job_id as string | null,
  };
}

export const getWorkshop = cache(async (): Promise<Workshop> => {
  const supabase = await createClient();
  const { data } = await supabase.from("workshops").select("*").limit(1).maybeSingle();

  if (!data) {
    redirect("/welcome");
  }

  return {
    id: data.id,
    name: data.name,
    kerfMm: Number(data.kerf_mm),
    displayUnit: data.display_unit,
  };
});

export const getMember = cache(async (): Promise<TeamMember> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("workshop_members")
    .select("role")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  if (!user || !data) {
    redirect("/welcome");
  }

  return {
    userId: user.id,
    name: user.user_metadata.name ?? "",
    email: user.email ?? "",
    role: data.role as TeamRole,
  };
});

/** Owners only: reads every login with the secret key, then keeps this workshop's people. */
export async function getTeam() {
  const supabase = await createClient();
  const [{ data: members }, { data: logins }] = await Promise.all([
    supabase.from("workshop_members").select("user_id, role").order("role"),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  return (members ?? []).flatMap((member): TeamMember[] => {
    const login = logins.users.find((user) => user.id === member.user_id);
    return login
      ? [
          {
            userId: login.id,
            name: login.user_metadata.name ?? "",
            email: login.email ?? "",
            role: member.role as TeamRole,
          },
        ]
      : [];
  });
}

export async function getMaterials() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("materials")
    .select("*, timber_lengths(*)")
    .order("kind")
    .order("name");
  return (data ?? []).map(toMaterial);
}

export async function getJobs() {
  const supabase = await createClient();
  const { data } = await supabase.from("jobs").select("*").order("created_at", { ascending: false });
  return (data ?? []).map(toJob);
}

export async function getJob(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
  return data ? toJob(data) : null;
}

export async function getPieces(jobId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("pieces").select("*").eq("job_id", jobId).order("created_at");
  return (data ?? []).map(toPiece);
}

export async function getSections(jobId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sections")
    .select("*")
    .eq("job_id", jobId)
    .order("position")
    .order("created_at");
  return (data ?? []).map(toSection);
}

export async function getLeftovers() {
  const supabase = await createClient();
  const { data } = await supabase.from("leftovers").select("*").order("created_at", { ascending: false });
  return (data ?? []).map(toLeftover);
}

export async function getPlan(jobId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("plans").select("plan").eq("job_id", jobId).maybeSingle();
  return (data?.plan as JobPlan | undefined) ?? null;
}
