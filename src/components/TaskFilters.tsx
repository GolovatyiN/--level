import { Search, X, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useDirections } from "@/hooks/useDirections";
import { useTasks } from "@/hooks/useTasks";
import { PRIORITIES, QUARTERS, STATUSES, quarterLabelRu } from "@/lib/constants";
import { useQuarters } from "@/hooks/useTaxonomies";
import { useMemo } from "react";
import { isOverdue } from "@/lib/utils";

export type SortKey = "created_desc" | "created_asc" | "deadline_asc" | "deadline_desc" | "priority_desc" | "title_asc";

export interface FiltersState {
  search: string;
  direction: string;
  quarter: string;
  status: string;
  priority: string;
  assignee: string;
  sort: SortKey;
}

export const initialFilters: FiltersState = {
  search: "",
  direction: "all",
  quarter: "all",
  status: "all",
  priority: "all",
  assignee: "all",
  sort: "created_desc",
};

const SORT_LABELS: { value: SortKey; label: string }[] = [
  { value: "created_desc", label: "Сначала новые" },
  { value: "created_asc", label: "Сначала старые" },
  { value: "deadline_asc", label: "Дедлайн ↑" },
  { value: "deadline_desc", label: "Дедлайн ↓" },
  { value: "priority_desc", label: "Приоритет ↓" },
  { value: "title_asc", label: "По названию" },
];

export function TaskFilters({
  value,
  onChange,
  hideStatus,
  includeArchived,
}: {
  value: FiltersState;
  onChange: (v: FiltersState) => void;
  hideStatus?: boolean;
  includeArchived?: boolean;
}) {
  const { data: directions = [] } = useDirections();
  const { data: allTasks = [] } = useTasks(includeArchived ?? true);
  const { data: dynamicQuarters = [] } = useQuarters();
  const quarterList = useMemo(() => {
    const set = new Set<string>(QUARTERS);
    dynamicQuarters.forEach((q) => set.add(q.label));
    return Array.from(set).sort();
  }, [dynamicQuarters]);

  const assignees = useMemo(() => {
    const set = new Set<string>();
    allTasks.forEach((t) => {
      const a = t.assignee?.trim();
      if (a) set.add(a);
    });
    return Array.from(set).sort();
  }, [allTasks]);

  const set = (k: keyof FiltersState, v: string) => onChange({ ...value, [k]: v });
  const isDefault =
    value.search === "" &&
    value.direction === "all" &&
    value.quarter === "all" &&
    value.status === "all" &&
    value.priority === "all" &&
    value.assignee === "all" &&
    value.sort === "created_desc";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/40 px-4 py-3 sm:px-8">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value.search}
          onChange={(e) => set("search", e.target.value)}
          placeholder="Поиск..."
          className="h-8 w-56 pl-8 text-sm"
        />
      </div>
      <Select value={value.direction} onValueChange={(v) => set("direction", v)}>
        <SelectTrigger className="h-8 w-[170px] text-sm"><SelectValue placeholder="Отдел" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все отделы</SelectItem>
          {directions.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={value.quarter} onValueChange={(v) => set("quarter", v)}>
        <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все кварталы</SelectItem>
          {quarterList.map((q) => <SelectItem key={q} value={q}>{quarterLabelRu(q)}</SelectItem>)}
        </SelectContent>
      </Select>
      {!hideStatus && (
        <Select value={value.status} onValueChange={(v) => set("status", v)}>
          <SelectTrigger className="h-8 w-[160px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="active">Активные</SelectItem>
            <SelectItem value="overdue">Просроченные</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Select value={value.priority} onValueChange={(v) => set("priority", v)}>
        <SelectTrigger className="h-8 w-[130px] text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все приоритеты</SelectItem>
          {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={value.assignee} onValueChange={(v) => set("assignee", v)}>
        <SelectTrigger className="h-8 w-[180px] text-sm"><SelectValue placeholder="Ответственный" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все ответственные</SelectItem>
          <SelectItem value="__none__">— не назначен —</SelectItem>
          {assignees.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="ml-auto flex items-center gap-2">
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={value.sort} onValueChange={(v) => set("sort", v as SortKey)}>
          <SelectTrigger className="h-8 w-[180px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORT_LABELS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {!isDefault && (
          <Button variant="ghost" size="sm" onClick={() => onChange(initialFilters)} className="h-8">
            <X className="mr-1 h-3.5 w-3.5" /> Сброс
          </Button>
        )}
      </div>
    </div>
  );
}

const PRIORITY_WEIGHT: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export function applyFilters<
  T extends {
    title: string;
    description: string | null;
    direction_id: string | null;
    quarter: string;
    status: string;
    priority: string;
    assignee: string | null;
    deadline: string | null;
    customer?: string | null;
    created_at?: string;
  },
>(tasks: T[], f: FiltersState): T[] {
  const search = f.search.trim().toLowerCase();
  const filtered = tasks.filter((t) => {
    if (search) {
      const hay = `${t.title} ${t.description ?? ""} ${t.customer ?? ""} ${t.assignee ?? ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (f.direction !== "all" && t.direction_id !== f.direction) return false;
    if (f.quarter !== "all" && t.quarter !== f.quarter) return false;
    if (f.priority !== "all" && t.priority !== f.priority) return false;
    if (f.assignee !== "all") {
      const a = t.assignee?.trim() ?? "";
      if (f.assignee === "__none__" ? a !== "" : a !== f.assignee) return false;
    }
    if (f.status !== "all") {
      if (f.status === "active") {
        if (t.status === "completed") return false;
      } else if (f.status === "overdue") {
        if (!isOverdue(t)) return false;
      } else if (t.status !== f.status) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  const cmpDate = (a?: string | null, b?: string | null, dir = 1) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return (new Date(a).getTime() - new Date(b).getTime()) * dir;
  };
  switch (f.sort) {
    case "created_asc":
      sorted.sort((a, b) => cmpDate(a.created_at, b.created_at, 1));
      break;
    case "deadline_asc":
      sorted.sort((a, b) => cmpDate(a.deadline, b.deadline, 1));
      break;
    case "deadline_desc":
      sorted.sort((a, b) => cmpDate(a.deadline, b.deadline, -1));
      break;
    case "priority_desc":
      sorted.sort((a, b) => (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0));
      break;
    case "title_asc":
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "created_desc":
    default:
      sorted.sort((a, b) => cmpDate(a.created_at, b.created_at, -1));
  }
  return sorted;
}
