import { useEffect, useMemo, type ReactElement, type ReactNode } from "react";
import { ImageOff, Monitor, Pause, Play } from "lucide-react";
import { cn } from "../utils";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";
import {
  createMotionModeStore,
  parseMotionMode,
  type MotionMode,
} from "./motion-mode/state";
import { MotionContext } from "./motion-mode/context";

export type { MotionMode } from "./motion-mode/state";

export function MotionModeProvider({
  storageKey,
  children,
}: {
  storageKey: string;
  children: ReactNode;
}): ReactElement {
  const store = useMemo(() => createMotionModeStore(storageKey), [storageKey]);
  useEffect(() => store.start(window), [store]);
  return (
    <MotionContext.Provider value={store}>{children}</MotionContext.Provider>
  );
}

const options = [
  { value: "motion", label: "Motion", Icon: Play },
  { value: "no-motion", label: "No motion", Icon: Pause },
  { value: "no-graphics", label: "No graphics", Icon: ImageOff },
  { value: "system", label: "System", Icon: Monitor },
] as const;

export interface MotionModeSelectorProps {
  value: MotionMode;
  onValueChange: (value: MotionMode) => void;
  className?: string;
}

export function MotionModeSelector({
  value,
  onValueChange,
  className,
}: MotionModeSelectorProps): ReactElement {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(parseMotionMode(next));
      }}
      aria-label="Motion mode"
      data-motion-mode-selector
      className={cn("gap-0.5", className)}
    >
      {options.map(({ value: option, label, Icon }) => (
        <ToggleGroupItem
          key={option}
          value={option}
          aria-label={label}
          className="size-7 rounded-sm border-0 p-0 text-muted/60 hover:bg-foreground/5 hover:text-foreground focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=on]:bg-foreground/8 data-[state=on]:text-foreground"
        >
          <Icon
            className="size-3.5 shrink-0"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
