"use client";

import { useEffect } from "react";

const MONSTER_CR_VALUES = [
  "0",
  "1/8",
  "1/4",
  "1/2",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
];

type QuickSearchEnhancerProps = {
  topicKey: string;
};

type QuickSearchMode = "monster" | "spell";

type DefaultControlState = {
  checked: boolean;
  value: string;
};

function normalizeQuickSearchText(input: string | null | undefined) {
  return (input ?? "").toLowerCase().trim();
}

function findReaderArticle(topicKey: string) {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("article[data-topic-key]")).find(
      (article) => article.dataset.topicKey === topicKey,
    ) ?? null
  );
}

function detectQuickSearchMode(rows: HTMLTableRowElement[]): QuickSearchMode | null {
  if (rows.some((row) => row.hasAttribute("monster"))) {
    return "monster";
  }

  if (rows.some((row) => row.hasAttribute("spell"))) {
    return "spell";
  }

  return null;
}

function matchAnyTag(tags: string, values: string[]) {
  return values.some((value) => tags.includes(value));
}

function matchMonsterCr(tags: string, minIndex: number, maxIndex: number) {
  const tagList = tags.split(/\s+/).filter(Boolean);

  return tagList.some((tag) => {
    const crIndex = MONSTER_CR_VALUES.indexOf(tag);
    return crIndex >= minIndex && crIndex <= maxIndex;
  });
}

function deriveToggleLabels(button: HTMLButtonElement | null) {
  const visibleLabel = button?.textContent?.trim() || "Hide filters";
  const hiddenLabel = visibleLabel.includes("Hide")
    ? visibleLabel.replace("Hide", "Show")
    : visibleLabel.includes("隐藏")
      ? visibleLabel.replace("隐藏", "显示")
      : "Show filters";

  return { visibleLabel, hiddenLabel };
}

function getCheckboxValues(article: HTMLElement, name: string) {
  return Array.from(
    article.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`),
  )
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => normalizeQuickSearchText(checkbox.value));
}

export function QuickSearchEnhancer({ topicKey }: QuickSearchEnhancerProps) {
  useEffect(() => {
    const article = findReaderArticle(topicKey);
    if (!article) {
      return;
    }

    const table =
      article.querySelector<HTMLTableElement>("[data-quicksearch-table]") ??
      Array.from(article.querySelectorAll<HTMLTableElement>("table")).find((candidate) =>
        candidate.querySelector("tr[monster], tr[spell]"),
      ) ??
      null;

    if (!table) {
      return;
    }

    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tr")).filter(
      (row) => row.hasAttribute("monster") || row.hasAttribute("spell"),
    );
    const mode = detectQuickSearchMode(rows);
    const input = article.querySelector<HTMLInputElement>(
      "[data-quicksearch-input], #input",
    );

    if (!mode || !input) {
      return;
    }

    const filterPanel = article.querySelector<HTMLElement>(
      "[data-quicksearch-filters], #filterDiv",
    );
    const submitButton = article.querySelector<HTMLButtonElement>(
      "[data-quicksearch-submit]",
    );
    const toggleButton = article.querySelector<HTMLButtonElement>(
      "[data-quicksearch-toggle]",
    );
    const selectAllButtons = Array.from(
      article.querySelectorAll<HTMLButtonElement>("[data-quicksearch-select-all]"),
    );
    const crMinSelect = article.querySelector<HTMLSelectElement>(
      '[data-quicksearch-cr="min"], #crMinSelect',
    );
    const crMaxSelect = article.querySelector<HTMLSelectElement>(
      '[data-quicksearch-cr="max"], #crMaxSelect',
    );
    const allCheckboxes = Array.from(
      article.querySelectorAll<HTMLInputElement>("input[type='checkbox']"),
    );
    const allSelects = Array.from(article.querySelectorAll<HTMLSelectElement>("select"));
    const defaultState = new Map<Element, DefaultControlState>();
    const cleanupCallbacks: Array<() => void> = [];

    for (const checkbox of allCheckboxes) {
      defaultState.set(checkbox, {
        checked: checkbox.checked,
        value: checkbox.value,
      });
    }

    for (const select of allSelects) {
      defaultState.set(select, {
        checked: false,
        value: select.value,
      });
    }

    const addClasses = (element: Element | null, ...classes: string[]) => {
      if (!element) {
        return;
      }

      element.classList.add(...classes);
      cleanupCallbacks.push(() => element.classList.remove(...classes));
    };

    article.dataset.quicksearchMode = mode;
    cleanupCallbacks.push(() => {
      delete article.dataset.quicksearchMode;
      delete article.dataset.quicksearchMatches;
    });

    addClasses(article, "reader-content--quicksearch");
    addClasses(input, "quicksearch-input");
    addClasses(input.parentElement, "quicksearch-bar");
    addClasses(filterPanel, "quicksearch-filters");
    addClasses(table, "quicksearch-table");
    addClasses(crMinSelect, "quicksearch-select");
    addClasses(crMaxSelect, "quicksearch-select");

    if (submitButton) {
      addClasses(submitButton, "quicksearch-button");
    }

    if (toggleButton) {
      addClasses(toggleButton, "quicksearch-button", "quicksearch-button--ghost");
    }

    for (const button of selectAllButtons) {
      addClasses(button, "quicksearch-chip");
    }

    const tableParent = table.parentElement;
    if (!tableParent) {
      return;
    }

    const tableWrapper = document.createElement("div");
    tableWrapper.className = "quicksearch-table-wrap";
    tableParent.insertBefore(tableWrapper, table);
    tableWrapper.appendChild(table);
    cleanupCallbacks.push(() => {
      if (tableWrapper.parentElement) {
        tableWrapper.parentElement.insertBefore(table, tableWrapper);
      }
      tableWrapper.remove();
    });

    const toolbar = document.createElement("div");
    toolbar.className = "quicksearch-toolbar";

    const summary = document.createElement("p");
    summary.className = "quicksearch-toolbar__summary";

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "quicksearch-button quicksearch-button--ghost";
    resetButton.dataset.quicksearchReset = "true";
    resetButton.textContent = "Reset";

    toolbar.append(summary, resetButton);
    tableWrapper.parentElement?.insertBefore(toolbar, tableWrapper);
    cleanupCallbacks.push(() => toolbar.remove());

    const defaultFiltersVisible = filterPanel
      ? window.getComputedStyle(filterPanel).display !== "none"
      : false;
    const originalFilterDisplay = filterPanel?.style.display ?? "";
    const originalToggleText = toggleButton?.textContent ?? "";
    const { hiddenLabel, visibleLabel } = deriveToggleLabels(toggleButton);

    const setFiltersVisible = (visible: boolean) => {
      if (!filterPanel) {
        return;
      }

      filterPanel.style.display = visible ? "block" : "none";
      toggleButton?.setAttribute("aria-expanded", String(visible));
      if (toggleButton) {
        toggleButton.textContent = visible ? visibleLabel : hiddenLabel;
      }
    };

    const syncMonsterCrRange = (changedSelect?: HTMLSelectElement) => {
      if (!crMinSelect || !crMaxSelect) {
        return;
      }

      const minIndex = Number.parseInt(crMinSelect.value, 10);
      const maxIndex = Number.parseInt(crMaxSelect.value, 10);

      if (minIndex <= maxIndex) {
        return;
      }

      if (changedSelect === crMinSelect) {
        crMaxSelect.value = crMinSelect.value;
        return;
      }

      crMinSelect.value = crMaxSelect.value;
    };

    const toggleCheckboxGroup = (groupName: string) => {
      const checkboxes = Array.from(
        article.querySelectorAll<HTMLInputElement>(
          `input[type="checkbox"][name="${groupName}"]`,
        ),
      );
      const allSelected =
        checkboxes.length > 0 && checkboxes.every((checkbox) => checkbox.checked);

      for (const checkbox of checkboxes) {
        checkbox.checked = !allSelected;
      }
    };

    const updateSummary = (visibleCount: number) => {
      article.dataset.quicksearchMatches = String(visibleCount);
      summary.textContent = `${visibleCount} of ${rows.length} results`;
    };

    const applyFilters = () => {
      const query = normalizeQuickSearchText(input.value);
      let visibleCount = 0;

      if (mode === "monster") {
        const selectedType = getCheckboxValues(article, "type");
        const selectedSize = getCheckboxValues(article, "size");
        const selectedBook = getCheckboxValues(article, "book");
        const selectedLegendary = getCheckboxValues(article, "legendary");
        const minCrIndex = crMinSelect
          ? Number.parseInt(crMinSelect.value, 10)
          : 0;
        const maxCrIndex = crMaxSelect
          ? Number.parseInt(crMaxSelect.value, 10)
          : MONSTER_CR_VALUES.length - 1;

        for (const row of rows) {
          const tags = normalizeQuickSearchText(row.getAttribute("tags"));
          const name = normalizeQuickSearchText(row.getAttribute("monster"));
          const matchesQuery = !query || name.includes(query);
          const matchesType =
            selectedType.length > 0 && matchAnyTag(tags, selectedType);
          const matchesSize =
            selectedSize.length > 0 && matchAnyTag(tags, selectedSize);
          const matchesBook =
            selectedBook.length > 0 && matchAnyTag(tags, selectedBook);
          const matchesLegendary =
            selectedLegendary.length > 0 && matchAnyTag(tags, selectedLegendary);
          const matchesCr = matchMonsterCr(
            row.getAttribute("tags") ?? "",
            minCrIndex,
            maxCrIndex,
          );
          const isVisible =
            matchesQuery &&
            matchesType &&
            matchesSize &&
            matchesBook &&
            matchesLegendary &&
            matchesCr;

          row.style.display = isVisible ? "" : "none";
          if (isVisible) {
            visibleCount += 1;
          }
        }
      } else {
        const selectedSchool = getCheckboxValues(article, "school");
        const selectedAction = getCheckboxValues(article, "action");
        const selectedClass = getCheckboxValues(article, "class");
        const selectedLevel = getCheckboxValues(article, "level");
        const selectedBook = getCheckboxValues(article, "book");
        const selectedSpecial = getCheckboxValues(article, "special");

        for (const row of rows) {
          const tags = normalizeQuickSearchText(row.getAttribute("tags"));
          const name = normalizeQuickSearchText(row.getAttribute("spell"));
          const matchesQuery = !query || name.includes(query);
          const matchesSchool =
            selectedSchool.length > 0 && matchAnyTag(tags, selectedSchool);
          const matchesAction =
            selectedAction.length > 0 && matchAnyTag(tags, selectedAction);
          const matchesClass =
            selectedClass.length > 0 && matchAnyTag(tags, selectedClass);
          const matchesLevel =
            selectedLevel.length > 0 && matchAnyTag(tags, selectedLevel);
          const matchesBook =
            selectedBook.length > 0 && matchAnyTag(tags, selectedBook);
          const matchesSpecial = selectedSpecial.every((value) => tags.includes(value));
          const isVisible =
            matchesQuery &&
            matchesSchool &&
            matchesAction &&
            matchesClass &&
            matchesLevel &&
            matchesBook &&
            matchesSpecial;

          row.style.display = isVisible ? "" : "none";
          if (isVisible) {
            visibleCount += 1;
          }
        }
      }

      updateSummary(visibleCount);
    };

    const restoreDefaults = () => {
      input.value = "";

      for (const [element, state] of defaultState.entries()) {
        if (element instanceof HTMLInputElement) {
          element.checked = state.checked;
          continue;
        }

        if (element instanceof HTMLSelectElement) {
          element.value = state.value;
        }
      }

      syncMonsterCrRange();
      setFiltersVisible(defaultFiltersVisible);
      applyFilters();
    };

    const handleInput = (event: Event) => {
      if (event.target === input) {
        applyFilters();
      }
    };

    const handleChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
        return;
      }

      if (target === crMinSelect || target === crMaxSelect) {
        syncMonsterCrRange(target);
      }

      if (
        target instanceof HTMLInputElement &&
        target.type !== "checkbox" &&
        target !== input
      ) {
        return;
      }

      applyFilters();
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const resetTarget = target.closest<HTMLButtonElement>("[data-quicksearch-reset]");
      if (resetTarget) {
        event.preventDefault();
        restoreDefaults();
        return;
      }

      const selectAllTarget = target.closest<HTMLButtonElement>(
        "[data-quicksearch-select-all]",
      );
      if (selectAllTarget) {
        event.preventDefault();
        const groupName = selectAllTarget.dataset.quicksearchSelectAll;
        if (groupName) {
          toggleCheckboxGroup(groupName);
          applyFilters();
        }
        return;
      }

      const submitTarget = target.closest<HTMLButtonElement>("[data-quicksearch-submit]");
      if (submitTarget) {
        event.preventDefault();
        applyFilters();
        return;
      }

      const toggleTarget = target.closest<HTMLButtonElement>("[data-quicksearch-toggle]");
      if (toggleTarget && filterPanel) {
        event.preventDefault();
        setFiltersVisible(window.getComputedStyle(filterPanel).display === "none");
      }
    };

    input.addEventListener("input", handleInput);
    article.addEventListener("change", handleChange);
    article.addEventListener("click", handleClick);
    cleanupCallbacks.push(() => input.removeEventListener("input", handleInput));
    cleanupCallbacks.push(() => article.removeEventListener("change", handleChange));
    cleanupCallbacks.push(() => article.removeEventListener("click", handleClick));
    cleanupCallbacks.push(() => {
      if (filterPanel) {
        filterPanel.style.display = originalFilterDisplay;
      }

      if (toggleButton) {
        toggleButton.textContent = originalToggleText;
        toggleButton.removeAttribute("aria-expanded");
      }

      for (const row of rows) {
        row.style.display = "";
      }
    });

    setFiltersVisible(defaultFiltersVisible);
    syncMonsterCrRange();
    applyFilters();

    return () => {
      for (const callback of cleanupCallbacks.reverse()) {
        callback();
      }
    };
  }, [topicKey]);

  return null;
}
