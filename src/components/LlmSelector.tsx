import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { providerIcon } from "../core/icons.js";
import { PROVIDER_CONFIGS } from "../core/llm/models.js";
import { checkProviders } from "../core/llm/provider.js";
import { useProviderModels } from "../hooks/useProviderModels.js";

const SPINNER_FRAMES = [
  "\u28CB",
  "\u28D9",
  "\u28F9",
  "\u28F8",
  "\u28FC",
  "\u28F4",
  "\u28E6",
  "\u28E7",
  "\u28C7",
  "\u28CF",
];
const POPUP_WIDTH = 44;
const POPUP_BG = "#111122";
const POPUP_HL = "#1a1a3e";

interface Props {
  visible: boolean;
  activeModel: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
}

type Level = "provider" | "model";

/**
 * A single row inside the popup with a full-width solid background.
 * Uses position="absolute" to layer a background fill behind the content,
 * since Ink Box doesn't support backgroundColor.
 */
function Row({ children, bg, w }: { children: React.ReactNode; bg?: string; w: number }) {
  const fill = bg ?? POPUP_BG;
  return (
    <Box width={w} height={1}>
      <Box position="absolute">
        <Text backgroundColor={fill}>{" ".repeat(w)}</Text>
      </Box>
      <Box position="absolute">
        <Text backgroundColor={fill}>{"  "}</Text>
        {children}
      </Box>
    </Box>
  );
}

export function LlmSelector({ visible, activeModel, onSelect, onClose }: Props) {
  const [level, setLevel] = useState<Level>("provider");
  const [providerCursor, setProviderCursor] = useState(0);
  const [modelCursor, setModelCursor] = useState(0);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [spinnerIdx, setSpinnerIdx] = useState(0);

  const { models, loading } = useProviderModels(expandedProvider);
  const providerStatuses = checkProviders();

  useEffect(() => {
    if (visible) {
      setLevel("provider");
      setExpandedProvider(null);
      setModelCursor(0);
    }
  }, [visible]);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setSpinnerIdx((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [loading]);

  useInput(
    (input, key) => {
      if (level === "provider") {
        if (key.escape) {
          onClose();
          return;
        }
        if (key.return) {
          const provider = PROVIDER_CONFIGS[providerCursor];
          if (provider) {
            setExpandedProvider(provider.id);
            setLevel("model");
            setModelCursor(0);
          }
          return;
        }
        if (key.upArrow || input === "k") {
          setProviderCursor((prev) => (prev > 0 ? prev - 1 : PROVIDER_CONFIGS.length - 1));
          return;
        }
        if (key.downArrow || input === "j") {
          setProviderCursor((prev) => (prev < PROVIDER_CONFIGS.length - 1 ? prev + 1 : 0));
          return;
        }
      }

      if (level === "model") {
        if (key.escape || key.leftArrow) {
          setLevel("provider");
          setExpandedProvider(null);
          return;
        }
        if (key.return && !loading && models.length > 0) {
          const model = models[modelCursor];
          const provider = expandedProvider;
          if (model && provider) {
            onSelect(`${provider}/${model.id}`);
            onClose();
          }
          return;
        }
        if (key.upArrow || input === "k") {
          setModelCursor((prev) => (prev > 0 ? prev - 1 : Math.max(0, models.length - 1)));
          return;
        }
        if (key.downArrow || input === "j") {
          setModelCursor((prev) => (prev < models.length - 1 ? prev + 1 : 0));
          return;
        }
      }
    },
    { isActive: visible },
  );

  if (!visible) return null;

  const slashIdx = activeModel.indexOf("/");
  const activeProvider = slashIdx >= 0 ? activeModel.slice(0, slashIdx) : "";
  const activeModelId = slashIdx >= 0 ? activeModel.slice(slashIdx + 1) : "";
  const innerW = POPUP_WIDTH - 2; // inside border

  if (level === "provider") {
    return (
      <Box
        position="absolute"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width="100%"
        height="100%"
      >
        <Box flexDirection="column" borderStyle="round" borderColor="#8B5CF6" width={POPUP_WIDTH}>
          {/* Title */}
          <Row w={innerW}>
            <Text color="white" bold backgroundColor={POPUP_BG}>
              {"\uDB80\uDE26"} Select Provider
            </Text>
          </Row>
          {/* Separator */}
          <Row w={innerW}>
            <Text color="#333" backgroundColor={POPUP_BG}>
              {"─".repeat(innerW - 4)}
            </Text>
          </Row>
          {/* Empty row for spacing */}
          <Row w={innerW}>
            <Text>{""}</Text>
          </Row>

          {PROVIDER_CONFIGS.map((provider, i) => {
            const isActive = i === providerCursor;
            const status = providerStatuses.find((s) => s.id === provider.id);
            const available = status?.available ?? false;
            const bg = isActive ? POPUP_HL : POPUP_BG;
            return (
              <Row key={provider.id} bg={bg} w={innerW}>
                <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#555"}>
                  {isActive ? "› " : "  "}
                </Text>
                <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#aaa"} bold={isActive}>
                  {providerIcon(provider.id)} {provider.name}
                </Text>
                <Text backgroundColor={bg}> </Text>
                <Text backgroundColor={bg} color={available ? "#00FF00" : "#FF0040"}>
                  {available ? "●" : "○"}
                </Text>
              </Row>
            );
          })}

          {/* Empty row for spacing */}
          <Row w={innerW}>
            <Text>{""}</Text>
          </Row>
          {/* Hints */}
          <Row w={innerW}>
            <Text color="#555" backgroundColor={POPUP_BG}>
              ↑↓ navigate ⏎ select esc close
            </Text>
          </Row>
        </Box>
      </Box>
    );
  }

  // Level: model
  const providerConfig = PROVIDER_CONFIGS.find((p) => p.id === expandedProvider);
  const providerName = providerConfig?.name ?? expandedProvider ?? "";

  return (
    <Box
      position="absolute"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
      height="100%"
    >
      <Box flexDirection="column" borderStyle="round" borderColor="#8B5CF6" width={POPUP_WIDTH}>
        {/* Title */}
        <Row w={innerW}>
          <Text color="white" bold backgroundColor={POPUP_BG}>
            {providerIcon(expandedProvider ?? "")} {providerName}
          </Text>
        </Row>
        {/* Separator */}
        <Row w={innerW}>
          <Text color="#333" backgroundColor={POPUP_BG}>
            {"─".repeat(innerW - 4)}
          </Text>
        </Row>
        {/* Back */}
        <Row w={innerW}>
          <Text color="#666" backgroundColor={POPUP_BG}>
            {" "}
            esc to go back
          </Text>
        </Row>
        {/* Empty row */}
        <Row w={innerW}>
          <Text>{""}</Text>
        </Row>

        {loading ? (
          <Row w={innerW}>
            <Text color="#9B30FF" backgroundColor={POPUP_BG}>
              {SPINNER_FRAMES[spinnerIdx]} fetching models...
            </Text>
          </Row>
        ) : (
          models.map((model, i) => {
            const isActive = i === modelCursor;
            const isCurrent = expandedProvider === activeProvider && model.id === activeModelId;
            const bg = isActive ? POPUP_HL : POPUP_BG;
            return (
              <Row key={model.id} bg={bg} w={innerW}>
                <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#555"}>
                  {isActive ? "› " : "  "}
                </Text>
                <Text
                  backgroundColor={bg}
                  color={isActive ? "#FF0040" : isCurrent ? "#00FF00" : "#aaa"}
                  bold={isActive}
                >
                  {model.id}
                </Text>
                {isCurrent && (
                  <Text backgroundColor={bg} color="#00FF00">
                    {" "}
                    ✓
                  </Text>
                )}
              </Row>
            );
          })
        )}

        {/* Empty row */}
        <Row w={innerW}>
          <Text>{""}</Text>
        </Row>
        {/* Hints */}
        <Row w={innerW}>
          <Text color="#555" backgroundColor={POPUP_BG}>
            ↑↓ navigate ⏎ select esc back
          </Text>
        </Row>
      </Box>
    </Box>
  );
}
