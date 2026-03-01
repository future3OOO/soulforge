import { useEffect, useState } from "react";
import {
  fetchProviderModels,
  getCachedModels,
  type ProviderModelInfo,
} from "../core/llm/models.js";

interface UseProviderModelsReturn {
  models: ProviderModelInfo[];
  loading: boolean;
}

export function useProviderModels(providerId: string | null): UseProviderModelsReturn {
  const [models, setModels] = useState<ProviderModelInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!providerId) {
      setModels([]);
      setLoading(false);
      return;
    }

    // Check cache synchronously first
    const cached = getCachedModels(providerId);
    if (cached) {
      setModels(cached);
      setLoading(false);
      return;
    }

    // Otherwise fetch asynchronously
    setLoading(true);
    let cancelled = false;

    fetchProviderModels(providerId).then((result) => {
      if (!cancelled) {
        setModels(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [providerId]);

  return { models, loading };
}
