"use strict";

const formats = { csv: 12424689, gzip: 2227138, parquet: 2198619 };
const flatBytes = 12424493;
const standardRate = 0.023;
const archiveRate = 0.00099;
const defaults = { step: 0, gb: 10, layout: "flat", format: "csv", archiveDays: 365, retentionYears: 7, provider: "aws", region: "us-east-1" };
const state = { ...defaults };
const byId = (id) => document.getElementById(id);
let language = "en";
const t = (key, values = {}) => i18next.t(key, values);
const numbers = (digits) => new Intl.NumberFormat(language, {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
});
const usd = (value) => `$\u00a0${numbers(4).format(value)}`;
const quantity = (value, unit) => `${numbers(0).format(value)}\u00a0${unit}`;
const money = (value) => `<bdi class="money" dir="ltr">${usd(value)}</bdi>`;
const nearZero = (value) => Math.abs(value) < 0.00005;

const steps = [
  () => slider("gb", t("volume"), 1, 1000, "GB"),
  () => choices("layout", t("layout"), ["flat", "date"]),
  () => choices("format", t("format"), Object.keys(formats)),
  () => slider("archiveDays", t("archive"), 0, 365, t("days")) + `<p class="fine">${t(state.provider === "gcp" ? "gcpArchiveAction" : "archiveAction")}</p><p class="fine">${t("archiveExplanation")}</p>` +
    slider("retentionYears", t("retention"), 1, 14, t("years")),
  cloudControls,
  sourceControls,
];

function slider(key, label, min, max, unit) {
  return `<label for="${key}">${label} <strong id="${key}-value">${quantity(state[key], unit)}</strong></label>
    <input id="${key}" data-key="${key}" data-unit="${unit}" type="range" min="${min}" max="${max}" value="${state[key]}">`;
}

function choices(key, label, options) {
  const inputs = options.map((value) => `
    <label class="choice"><input type="radio" name="${key}" data-key="${key}" value="${value}"
    ${state[key] === value ? "checked" : ""}> ${t(value)}</label>`).join("");
  return `<fieldset><legend>${label}</legend>${inputs}</fieldset>`;
}

function archiveShare(model) {
  if (model.archive !== undefined) return model.archive / 100;
  const retainedDays = 365 * model.retentionYears;
  return retainedDays ? Math.max(0, retainedDays - model.archiveDays) / retainedDays : 0;
}

function calculate(model) {
  const rates = selectedCloud(model);
  const sampleBytes = model.format === "csv" && model.layout === "flat" ? flatBytes : formats[model.format];
  const originalGiB = model.gb * 1e9 / 2 ** 30;
  const retainedGiB = originalGiB * sampleBytes / flatBytes * model.retentionYears;
  const archived = retainedGiB * archiveShare(model);
  const active = retainedGiB - archived;
  return { baseline: originalGiB * model.retentionYears * standardRate, estimate: active * rates.standard + archived * rates.archive, active, archived };
}

function updateComparison(baseline) {
  const scenarios = [
    { archive: 0 },
    { archive: 80 },
    { archiveDays: 90, retentionYears: 1 },
    { archiveDays: state.archiveDays, retentionYears: state.retentionYears },
  ];
  byId("comparison-context").textContent = t("context", {
    volume: quantity(state.gb, "GB"), cost: "\u2066" + usd(baseline) + "\u2069",
  });
  byId("comparison-rows").innerHTML = Object.keys(formats).map((format) => {
    const cells = scenarios.map((policy) => {
      const { estimate } = calculate({ ...state, layout: "date", format, ...policy });
      const savings = baseline - estimate;
      const change = nearZero(savings) ? t("same") : t(savings > 0 ? "cellSaved" : "cellExtra", {
        cost: money(Math.abs(savings)),
      });
      return `<td><strong>${money(estimate)}</strong><small>${change}</small></td>`;
    }).join("");
    return `<tr><th scope="row">${t(format)}</th>${cells}</tr>`;
  }).join("");
}

function configuration(model) {
  return [
    model.provider === "gcp" ? "Google Cloud Storage" : "Amazon S3",
    model.region,
    t(model.format),
    t(model.layout),
    `${model.provider === "gcp" ? "Standard" : "S3 Standard"} ${quantity(100 * (1 - archiveShare(model)), "%")}`,
    `${model.provider === "gcp" ? "Archive" : "Deep Archive"} ${quantity(100 * archiveShare(model), "%")}`,
    `${t("retention")} ${quantity(model.retentionYears, t("years"))}`,
  ].map((line) => `<li>${line}</li>`).join("");
}

function updateTotals() {
  const { baseline, estimate } = calculate(state);
  updateComparison(baseline);
  updateSourceTotals();
  byId("cloud-context").textContent = t("cloudContext", { provider: state.provider === "aws" ? "Amazon S3" : "Google Cloud Storage", region: state.region, standard: usd(selectedCloud(state).standard), archive: usd(selectedCloud(state).archive) });
  byId("baseline").textContent = usd(baseline);
  byId("estimate").textContent = usd(estimate);
  byId("before-config").innerHTML = configuration({ ...defaults, gb: state.gb, retentionYears: state.retentionYears, archive: 0 });
  byId("after-config").innerHTML = configuration(state);
  const difference = baseline - estimate;
  byId("savings-label").textContent = t(nearZero(difference) ? "same" : difference > 0 ? "saved" : "extra");
  byId("savings").textContent = usd(nearZero(difference) ? 0 : Math.abs(difference));
  byId("savings-percent").textContent = t(difference < 0 ? "percentExtra" : "percentSaved", { percent: new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }).format(Math.abs(difference) / baseline) });
}

function showStep(index, focus = false) {
  state.step = index;
  byId("source-summary").open = index === 5;
  const lesson = (key) => t(`lesson${index}.${key}`);
  byId("step").textContent = t("step", { current: numbers(0).format(index + 1), total: numbers(0).format(steps.length) });
  byId("title").textContent = lesson("title");
  byId("description").textContent = lesson("description");
  byId("controls").innerHTML = steps[index]();
  if (focus) byId("note").open = false;
  byId("note-title").textContent = lesson("note");
  byId("note-body").textContent = lesson("detail");
  if (index === 3 && state.provider === "gcp") {
    byId("description").textContent = t("gcpLifecycle");
    byId("note-body").textContent = t("lesson4.detail");
  }
  byId("back").disabled = index === 0;
  byId("next").textContent = index === steps.length - 1 ? t("reset") : t("next");
  [...byId("steps").children].forEach((button, i) => {
    button.textContent = t(`lesson${i}.name`);
    if (index === i) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  updateTotals();
  if (focus) byId("title").focus();
}

async function initializeLab() {
  await initializeTranslations();
  language = i18next.resolvedLanguage;
  steps.forEach((_, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", () => showStep(index, true));
    byId("steps").append(button);
  });
  byId("controls").addEventListener("input", ({ target }) => {
    if (target.dataset.source) {
      const key = target.dataset.source;
      if (key === 'service') { sourceState.service = target.value; showStep(state.step); }
      else if (target.value !== '' && target.validity.valid) { sourceState[key] = Number(target.value); updateSourceTotals(); }
      return;
    }
    if (target.dataset.cloud) {
      state[target.dataset.cloud] = target.value;
      if (target.dataset.cloud === 'provider') state.region = Object.keys(cloudProfiles[state.provider])[0];
      showStep(state.step);
      return;
    }
    const { key, unit } = target.dataset;
    if (!key) return;
    state[key] = unit ? Number(target.value) : target.value;
    if (unit) byId(`${key}-value`).textContent = quantity(Number(target.value), unit);
    updateTotals();
  });
  byId("back").addEventListener("click", () => showStep(state.step - 1, true));
  byId("next").addEventListener("click", () => {
    if (state.step < steps.length - 1) showStep(state.step + 1, true);
    else {
      Object.assign(state, defaults);
      Object.assign(sourceState, sourceDefaults);
      showStep(0, true);
    }
  });
  function renderLanguage() {
    byId("language").value = language;
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.title = t("site");
    document.querySelectorAll("[data-t]").forEach((node) => {
      node.textContent = t(node.dataset.t);
    });
    document.querySelectorAll("[data-label]").forEach((node) => {
      node.setAttribute("aria-label", t(node.dataset.label));
    });
    byId("back").textContent = t("back");
    showStep(state.step);
  }
  byId("language").addEventListener("change", async ({ target }) => {
    target.disabled = true;
    try {
      await selectLanguage(target.value);
      language = i18next.resolvedLanguage;
      renderLanguage();
    } finally {
      target.disabled = false;
    }
  });
  renderLanguage();
}

if (typeof document !== "undefined") {
  initializeLab().catch((error) => {
    console.error("Unable to initialize translations", error);
    byId("title").textContent = "Unable to load the page. Please reload and try again.";
  });
}
