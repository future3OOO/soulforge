import { Box, Text } from "ink";
import type { Plan, PlanStepStatus } from "../types/index.js";
import { POPUP_BG, PopupRow, Spinner } from "./shared.js";

const POPUP_WIDTH = 32;

const STATUS_ICONS: Record<PlanStepStatus, string> = {
  done: "\uF058", //  nf-fa-check_circle
  active: "", // filled by spinner
  pending: "\uDB80\uDD31", // 󰄱 nf-md-checkbox_blank_outline
  skipped: "\uDB80\uDD56", // 󰅖 nf-md-close_circle_outline
};

const STATUS_COLORS: Record<PlanStepStatus, string> = {
  done: "#2d5",
  active: "#FF0040",
  pending: "#555",
  skipped: "#444",
};

interface Props {
  plan: Plan;
  mode: "overlay" | "inline";
}

export function PlanView({ plan, mode }: Props) {
  const doneCount = plan.steps.filter((s) => s.status === "done").length;
  const totalCount = plan.steps.length;
  const allDone = doneCount === totalCount;

  if (mode === "overlay") {
    return <OverlayPlan plan={plan} doneCount={doneCount} totalCount={totalCount} />;
  }

  return <InlinePlan plan={plan} doneCount={doneCount} totalCount={totalCount} allDone={allDone} />;
}

function OverlayPlan({
  plan,
  doneCount,
  totalCount,
}: {
  plan: Plan;
  doneCount: number;
  totalCount: number;
}) {
  const innerW = POPUP_WIDTH - 2;
  const maxLabel = 22; // truncate labels to fit

  return (
    <Box flexDirection="column">
      {/* Title */}
      <PopupRow w={innerW}>
        <Text color="#9B30FF" bold backgroundColor={POPUP_BG}>
          {"\uF0CB"} Plan
        </Text>
        <Text color="#555" backgroundColor={POPUP_BG}>
          {"  "}
          {String(doneCount)}/{String(totalCount)}
        </Text>
      </PopupRow>
      {/* Separator */}
      <PopupRow w={innerW}>
        <Text color="#333" backgroundColor={POPUP_BG}>
          {"─".repeat(innerW - 4)}
        </Text>
      </PopupRow>
      {/* Steps */}
      {plan.steps.map((step) => (
        <PopupRow key={step.id} w={innerW}>
          {step.status === "active" ? (
            <Spinner />
          ) : (
            <Text color={STATUS_COLORS[step.status]} backgroundColor={POPUP_BG}>
              {STATUS_ICONS[step.status]}
            </Text>
          )}
          <Text
            color={step.status === "active" ? "#eee" : STATUS_COLORS[step.status]}
            bold={step.status === "active"}
            backgroundColor={POPUP_BG}
          >
            {" "}
            {step.label.length > maxLabel ? `${step.label.slice(0, maxLabel - 1)}…` : step.label}
          </Text>
        </PopupRow>
      ))}
    </Box>
  );
}

function InlinePlan({
  plan,
  doneCount,
  totalCount,
  allDone,
}: {
  plan: Plan;
  doneCount: number;
  totalCount: number;
  allDone: boolean;
}) {
  const counterText = allDone ? "done" : `${String(doneCount)}/${String(totalCount)}`;
  // Compute inner width: widest label + icon padding, min 30
  const titleLen = plan.title.length + 4; // icon + spaces
  const maxLabel = Math.max(titleLen, ...plan.steps.map((s) => s.label.length + 4));
  const counterLen = counterText.length + 4; // " ── done "
  const innerW = Math.max(30, Math.min(56, maxLabel + counterLen));

  // Header: ╭──  Plan Title ──────────── 2/4 ╮
  const headerContent = `  \uF0CB ${plan.title} `;
  const headerRight = ` ${counterText} `;
  const headerFill = Math.max(0, innerW - headerContent.length - headerRight.length);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Text>
        <Text color="#6A0DAD">╭──</Text>
        <Text color="#9B30FF" bold>
          {headerContent}
        </Text>
        <Text color="#6A0DAD">{"─".repeat(headerFill)}</Text>
        <Text color="#555">{headerRight}</Text>
        <Text color="#6A0DAD">╮</Text>
      </Text>
      {/* Steps */}
      {plan.steps.map((step) => {
        const label = `${STATUS_ICONS[step.status]} ${step.label}`;
        const pad = Math.max(0, innerW - label.length - 1);
        return (
          <Box key={step.id} height={1}>
            <Text wrap="truncate">
              <Text color="#6A0DAD">│ </Text>
              <Text color={STATUS_COLORS[step.status]}>{label}</Text>
              <Text>{" ".repeat(pad)}</Text>
              <Text color="#6A0DAD">│</Text>
            </Text>
          </Box>
        );
      })}
      {/* Footer */}
      <Text>
        <Text color="#6A0DAD">╰{"─".repeat(innerW)}╯</Text>
      </Text>
    </Box>
  );
}
