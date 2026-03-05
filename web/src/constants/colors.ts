export const typeColor: Record<string, string> = {
  'workflow.started': 'text-emerald-400',
  'workflow.completed': 'text-emerald-400',
  'step.started': 'text-amber-400',
  'step.completed': 'text-emerald-400',
  'step.failed': 'text-red-400',
  'step.skipped': 'text-g-7',
  'step.log': 'text-sky-400',
  'step.waiting': 'text-amber-400',
  'step.input': 'text-violet-400',
  'step.output': 'text-violet-400',
  'step.goto': 'text-amber-400',
}

export const chipColor: Record<string, string> = {
  'workflow.started': 'bg-emerald-400/15 text-emerald-400 border-emerald-400/30',
  'workflow.completed': 'bg-emerald-400/15 text-emerald-400 border-emerald-400/30',
  'step.started': 'bg-amber-400/15 text-amber-400 border-amber-400/30',
  'step.completed': 'bg-emerald-400/15 text-emerald-400 border-emerald-400/30',
  'step.failed': 'bg-red-400/15 text-red-400 border-red-400/30',
  'step.skipped': 'bg-g-4 text-g-9 border-g-6',
  'step.log': 'bg-sky-400/15 text-sky-400 border-sky-400/30',
  'step.waiting': 'bg-amber-400/15 text-amber-400 border-amber-400/30',
  'step.input': 'bg-violet-400/15 text-violet-400 border-violet-400/30',
  'step.output': 'bg-violet-400/15 text-violet-400 border-violet-400/30',
  'step.goto': 'bg-amber-400/15 text-amber-400 border-amber-400/30',
}

export const typeHex: Record<string, string> = {
  'workflow.started': '#34d399',
  'workflow.completed': '#34d399',
  'step.started': '#fbbf24',
  'step.waiting': '#fbbf24',
  'step.completed': '#34d399',
  'step.failed': '#f87171',
  'step.skipped': '#6b7280',
  'step.log': '#38bdf8',
  'step.input': '#a78bfa',
  'step.output': '#a78bfa',
  'step.goto': '#fbbf24',
}
