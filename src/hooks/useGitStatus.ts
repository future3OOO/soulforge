import { useCallback, useEffect, useRef, useState } from "react";
import { getGitStatus } from "../core/git/status.js";

interface GitStatusState {
  branch: string | null;
  isDirty: boolean;
  isRepo: boolean;
  staged: number;
  refresh: () => void;
}

export function useGitStatus(cwd: string): GitStatusState {
  const [branch, setBranch] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isRepo, setIsRepo] = useState(false);
  const [staged, setStaged] = useState(0);
  const mountedRef = useRef(true);

  const poll = useCallback(() => {
    getGitStatus(cwd)
      .then((status) => {
        if (!mountedRef.current) return;
        setIsRepo(status.isRepo);
        setBranch(status.branch);
        setIsDirty(status.isDirty);
        setStaged(status.staged.length);
      })
      .catch(() => {});
  }, [cwd]);

  useEffect(() => {
    mountedRef.current = true;
    poll();
    const interval = setInterval(poll, 5_000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [poll]);

  return { branch, isDirty, isRepo, staged, refresh: poll };
}
