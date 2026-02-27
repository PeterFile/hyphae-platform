import { create } from "zustand";

interface CompareState {
  selectedIds: string[]; // Keep in format "provider:originalId"
  toggleAgent: (provider: string, originalId: string) => void;
  removeAgent: (provider: string, originalId: string) => void;
  clear: () => void;
}

export const useCompareStore = create<CompareState>((set) => ({
  selectedIds: [],
  toggleAgent: (provider, originalId) =>
    set((state) => {
      const id = `${provider}:${originalId}`;
      const isSelected = state.selectedIds.includes(id);

      if (isSelected) {
        return {
          selectedIds: state.selectedIds.filter(
            (selectedId) => selectedId !== id
          ),
        };
      } else {
        if (state.selectedIds.length >= 4) {
          // Max 4 agents
          return state;
        }
        return {
          selectedIds: [...state.selectedIds, id],
        };
      }
    }),
  removeAgent: (provider, originalId) =>
    set((state) => ({
      selectedIds: state.selectedIds.filter(
        (id) => id !== `${provider}:${originalId}`
      ),
    })),
  clear: () => set({ selectedIds: [] }),
}));
