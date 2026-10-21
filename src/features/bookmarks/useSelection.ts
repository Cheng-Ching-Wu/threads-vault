import { computed, ref } from 'vue';

export function useSelection() {
  const selecting = ref(false);
  const selectedIds = ref(new Set<string>());

  function toggle(id: string) {
    const next = new Set(selectedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds.value = next;
  }
  function setAll(ids: string[]) {
    selectedIds.value = new Set(ids);
  }
  function clear() {
    selectedIds.value = new Set();
  }
  function start() {
    selecting.value = true;
  }
  function stop() {
    selecting.value = false;
    clear();
  }

  const count = computed(() => selectedIds.value.size);
  const ids = computed(() => [...selectedIds.value]);

  return { selecting, selectedIds, count, ids, toggle, setAll, clear, start, stop };
}

export type Selection = ReturnType<typeof useSelection>;
