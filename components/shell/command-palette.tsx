'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { NAV, type NavItem } from '@/lib/nav';
import { STATES, STATE_METRICS } from '@/lib/data/states';
import { useSettings } from '@/hooks/use-settings';

/** Global search (Cmd/Ctrl+K) across tabs, Bundesländer and metrics. */
export function CommandPalette() {
  const router = useRouter();
  const open = useSettings((s) => s.paletteOpen);
  const setOpen = useSettings((s) => s.setPaletteOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e?.metaKey || e?.ctrlKey) && e?.key?.toLowerCase?.() === 'k') {
        e.preventDefault();
        setOpen(!useSettings.getState().paletteOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search tabs, Bundesländer, metrics…" />
      <CommandList>
        <CommandEmpty>No match.</CommandEmpty>
        <CommandGroup heading="Tabs">
          {(NAV ?? []).map((n: NavItem) => (
            <CommandItem key={n.id} value={`tab ${n.label} ${n.keywords ?? ''}`} onSelect={() => go(n.href)}>
              <span className="font-medium">{n.label}</span>
              <span className="ml-2 truncate text-xs text-muted-foreground">{n.blurb}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Bundesländer">
          {(STATES ?? []).map((s: { code: string; name: string }) => (
            <CommandItem key={s.code} value={`state ${s.name} ${s.code}`} onSelect={() => go(`/states?state=${s.code}`)}>
              <span className="w-8 font-mono text-xs text-muted-foreground">{s.code}</span>
              {s.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="State metrics (map)">
          {(STATE_METRICS ?? []).map((m: { id: string; label: string; group: string; unit: string }) => (
            <CommandItem key={m.id} value={`metric ${m.label} ${m.group}`} onSelect={() => go(`/states?metric=${m.id}`)}>
              {m.label}
              <span className="ml-2 text-xs text-muted-foreground">{m.group}{m.unit ? ` · ${m.unit}` : ''}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
