import { Box, Text } from "ink";

// Explicit nerdfonts codepoints to avoid invisible character issues
const ICONS = {
  edit: "\uF044", // nf-fa-pencil_square_o
  brain: "\uDB80\uDE26", // nf-md-brain (U+F0626)
  think: "\uDB80\uDE26", // nf-md-brain (U+F0626)
  trash: "\uDB80\uDDB4", // nf-md-delete (U+F01B4)
  help: "\uF059", // nf-fa-question_circle
  skill: "\uDB82\uDD2A", // nf-md-puzzle (U+F092A)
  git: "󰊢", // nf-md-source_branch (U+F02A2)
  mode: "\uF013", // nf-fa-gear
  error: "\uF06A", // nf-fa-exclamation_circle
  session: "\uF017", // nf-fa-clock_o
  quit: "\uF08B", // nf-fa-sign_out
  stop: "\uF04D", // nf-fa-stop
};

export function Footer() {
  return (
    <Box flexDirection="row" justifyContent="center" paddingX={1} width="100%" gap={2}>
      <Shortcut k="^X" icon={ICONS.stop} l="Stop" />
      <Shortcut k="^D" icon={ICONS.mode} l="Mode" />
      <Shortcut k="^E" icon={ICONS.edit} l="Editor" />
      <Shortcut k="^G" icon={ICONS.git} l="Git" />
      <Shortcut k="^L" icon={ICONS.brain} l="LLM" />
      <Shortcut k="^P" icon={ICONS.session} l="Sessions" />
      <Shortcut k="^S" icon={ICONS.skill} l="Skills" />
      <Shortcut k="^Y" icon={ICONS.edit} l="Select" />
      <Shortcut k="^R" icon={ICONS.error} l="Errors" />
      <Shortcut k="⌥T" icon={ICONS.edit} l="Tab" />
      <Shortcut k="^K" icon={ICONS.trash} l="Clear" />
      <Shortcut k="^H" icon={ICONS.help} l="Help" />
      <Shortcut k="^C" icon={ICONS.quit} l="Quit" />
    </Box>
  );
}

function Shortcut({ k, icon, l }: { k: string; icon: string; l: string }) {
  return (
    <Text>
      <Text color="#FF0040" bold>
        {k}
      </Text>
      <Text color="#555">
        {" "}
        {icon} {l}
      </Text>
    </Text>
  );
}
