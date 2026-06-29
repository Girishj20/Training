document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const form = document.getElementById('patientForm');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const btnPredictBoth = document.getElementById('btnPredictBoth');
    const patientNameInput = document.getElementById('Patient_Name');
    const patientDisplayName = document.getElementById('patientDisplayName');
    
    // Prediction Output Elements
    const predictedCostValue = document.getElementById('predictedCostValue');
    const costProgress = document.getElementById('costProgress');
    const costPercentText = document.getElementById('costPercentText');
    const predictedOperationBadge = document.getElementById('predictedOperationBadge');
    const probProgress = document.getElementById('probProgress');
    const probPercentText = document.getElementById('probPercentText');
    
    // Interdependent Inputs
    const operationNeededInput = document.getElementById('Operation_Needed_Input');
    const treatmentCostInput = document.getElementById('Treatment_Cost_Input');
    
    // Feature Importance Chart Elements
    const toggleRegImp = document.getElementById('toggleRegImp');
    const toggleClfImp = document.getElementById('toggleClfImp');
    const importanceChart = document.getElementById('importanceChart');

    // Patient Directory Elements
    const patientSearchInput = document.getElementById('patientSearchInput');
    const patientListBody = document.getElementById('patientListBody');
    const groundTruthPanel = document.getElementById('groundTruthPanel');
    const gtCost = document.getElementById('gtCost');
    const gtOp = document.getElementById('gtOp');
    const tabBtnDemographics = document.querySelector('[data-tab="demographics"]');
    
    // Care Plan Elements
    const carePlanPanel = document.getElementById('carePlanPanel');
    const dietSuggestionText = document.getElementById('dietSuggestionText');
    const medSuggestionText = document.getElementById('medSuggestionText');
    
    // State variables
    let metadata = {};
    let mlInsightsData = null;
    let patientsList = [];
    let currentImportanceView = 'regressor';
    let charts = {};

    const MIN_COST = 25065.0;
    const MAX_COST = 1067095.0;

    // 1. Tab Switching Logic for Predictor Form Sub-tabs
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            tabButtons.forEach(btn => btn.classList.remove('active', 'bg-white', 'text-textDark', 'shadow-sm'));
            button.classList.add('active', 'bg-white', 'text-textDark', 'shadow-sm');
            
            tabContents.forEach(content => {
                if (content.id === `tab-${targetTab}`) {
                    content.classList.remove('hidden');
                    content.classList.add('block');
                } else {
                    content.classList.remove('block');
                    content.classList.add('hidden');
                }
            });
        });
    });

    // Sync Patient Name with Display Header
    patientNameInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        patientDisplayName.textContent = `Patient: ${val || 'Anonymous'}`;
    });

    // 2. Fetch Metadata & Populate Categorical Dropdowns
    async function loadMetadata() {
        try {
            const response = await fetch('/api/metadata');
            metadata = await response.json();
            
            const features = metadata.features;
            
            for (const [key, value] of Object.entries(features)) {
                if (value.type === 'categorical') {
                    const selectEl = document.getElementById(key);
                    if (selectEl) {
                        selectEl.innerHTML = '';
                        value.values.forEach(optionVal => {
                            const opt = document.createElement('option');
                            opt.value = optionVal;
                            opt.textContent = optionVal;
                            if (optionVal === value.default) {
                                opt.selected = true;
                            }
                            selectEl.appendChild(opt);
                        });
                    }
                }
            }
            
            setupSliderEventListeners(features);
        } catch (error) {
            console.error("Error loading metadata:", error);
        }
    }

    function setupSliderEventListeners(features) {
        for (const [key, value] of Object.entries(features)) {
            if (value.type === 'numeric') {
                const slider = document.getElementById(key);
                const valueLabel = document.getElementById(`val-${key}`);
                if (slider && valueLabel) {
                    valueLabel.textContent = slider.value;
                    slider.addEventListener('input', (e) => {
                        valueLabel.textContent = e.target.value;
                    });
                }
            }
        }
    }

    // 3. Fetch Feature Importances for Predictor View Local Drivers
    async function loadLocalFeatureImportances() {
        try {
            const response = await fetch('/api/feature_importance');
            const data = await response.json();
            if (data.status === 'success') {
                featureImportances = data;
                renderLocalFeatureImportances();
            }
        } catch (error) {
            console.error("Error loading feature importances:", error);
            importanceChart.innerHTML = '<div class="text-xs text-dangerRose flex items-center justify-center h-44"><i class="fa-solid fa-triangle-exclamation mr-2"></i> Error loading splits</div>';
        }
    }

    function renderLocalFeatureImportances() {
        importanceChart.innerHTML = '';
        const list = currentImportanceView === 'regressor' 
            ? (featureImportances.regressor_importance || []) 
            : (featureImportances.classifier_importance || []);
            
        if (list.length === 0) {
            importanceChart.innerHTML = '<div class="text-xs text-textSec flex items-center justify-center h-44">No driver data available</div>';
            return;
        }

        const maxVal = Math.max(...list.map(item => item[1]));

        list.slice(0, 6).forEach(item => {
            const featureName = item[0].replace(/_/g, ' ');
            const val = item[1];
            const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;

            const row = document.createElement('div');
            row.className = "space-y-1.5";

            row.innerHTML = `
                <div class="flex justify-between text-[10px] font-semibold text-textSec">
                    <span class="capitalize">${featureName}</span>
                    <span>${val.toFixed(4)}</span>
                </div>
                <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-1000 ${currentImportanceView === 'regressor' ? 'bg-primaryBlue' : 'bg-accentViolet'}" style="width: 0%;" id="bar-${item[0]}"></div>
                </div>
            `;
            importanceChart.appendChild(row);
            
            setTimeout(() => {
                const bar = document.getElementById(`bar-${item[0]}`);
                if (bar) bar.style.width = `${pct}%`;
            }, 50);
        });
    }

    toggleRegImp.addEventListener('click', () => {
        toggleRegImp.className = "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all bg-white text-textDark shadow-sm";
        toggleClfImp.className = "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all text-textSec";
        currentImportanceView = 'regressor';
        renderLocalFeatureImportances();
    });

    toggleClfImp.addEventListener('click', () => {
        toggleClfImp.className = "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all bg-white text-textDark shadow-sm";
        toggleRegImp.className = "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all text-textSec";
        currentImportanceView = 'classifier';
        renderLocalFeatureImportances();
    });

    function getFormData() {
        const formData = new FormData(form);
        const data = {};
        for (const [key, value] of formData.entries()) {
            if (key === 'Patient_Name') {
                data[key] = value;
            } else {
                const inputEl = document.getElementById(key);
                if (inputEl && inputEl.type === 'range') {
                    data[key] = parseFloat(value);
                } else {
                    data[key] = value;
                }
            }
        }
        return data;
    }

    // 4. Inferences
    async function predictCost(baseData) {
        const payload = { ...baseData, "Operation_Needed": operationNeededInput.value };
        predictedCostValue.textContent = 'Calculating...';
        costProgress.style.width = '0%';

        try {
            const response = await fetch('/api/predict_cost', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            if (result.predicted_cost !== undefined) {
                const cost = result.predicted_cost;
                predictedCostValue.textContent = Math.round(cost).toLocaleString();
                
                let pct = ((cost - MIN_COST) / (MAX_COST - MIN_COST)) * 100;
                pct = Math.max(0, Math.min(100, pct));
                costProgress.style.width = `${pct}%`;
                costPercentText.textContent = `${Math.round(pct)}% of max record`;
                treatmentCostInput.value = Math.round(cost);
            } else {
                predictedCostValue.textContent = "Error";
            }
        } catch (error) {
            console.error("Error predicting cost:", error);
            predictedCostValue.textContent = "Error";
        }
    }

    async function predictOperation(baseData) {
        const payload = { ...baseData, "Treatment_Cost": parseFloat(treatmentCostInput.value) };
        predictedOperationBadge.className = 'op-badge flex items-center space-x-2 px-6 py-2.5 rounded-xl font-heading font-bold text-base bg-slate-100 text-textSec border border-slate-200 animate-pulse';
        predictedOperationBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>CHECKING...</span>';
        probProgress.style.width = '0%';
        probPercentText.textContent = '--%';

        try {
            const response = await fetch('/api/predict_operation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.prediction !== undefined) {
                const isYes = result.prediction === 'Yes';
                const prob = result.probability_yes;
                const confidencePercent = Math.round(isYes ? prob * 100 : (1 - prob) * 100);

                predictedOperationBadge.className = `op-badge flex items-center space-x-2 px-6 py-2.5 rounded-xl font-heading font-bold text-base transition-all duration-300 border ${
                    isYes ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`;
                predictedOperationBadge.innerHTML = isYes 
                    ? '<i class="fa-solid fa-circle-exclamation text-rose-500"></i> <span>YES (SURGERY)</span>'
                    : '<i class="fa-solid fa-circle-check text-emerald-500"></i> <span>NO (STABLE)</span>';

                probProgress.style.width = `${prob * 100}%`;
                probPercentText.textContent = `${confidencePercent}% confidence`;
                operationNeededInput.value = result.prediction;
            } else {
                resetOperationBadgeError();
            }
        } catch (error) {
            console.error("Error predicting operation:", error);
            resetOperationBadgeError();
        }
    }

    function resetOperationBadgeError() {
        predictedOperationBadge.className = 'op-badge flex items-center space-x-2 px-6 py-2.5 rounded-xl font-heading font-bold text-base bg-slate-100 text-textSec border border-slate-200';
        predictedOperationBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-rose-500"></i> <span>ERROR</span>';
    }

    btnPredictBoth.addEventListener('click', async () => {
        const baseData = getFormData();
        await Promise.all([
            predictCost(baseData),
            predictOperation(baseData)
        ]);
        updateClinicalCarePlan(baseData.Disease_Type, baseData.Medication_Count, operationNeededInput.value);
    });

    function updateClinicalCarePlan(diseaseType, medicationCount, operationNeeded) {
        const dietSuggestions = {
            "Diabetes": "<strong>Low Glycemic / Diabetic Diet:</strong> Restrict refined carbohydrates, sweets, and high-sugar foods. Emphasize high-fiber vegetables, lean proteins (chicken, fish), and complex carbohydrates (oats, brown rice). Monitor blood sugar levels closely and maintain consistent meal schedules.",
            "Heart Disease": "<strong>Cardiac / Low-Sodium Diet (DASH):</strong> Limit sodium intake to < 1,500 - 2,000 mg per day to manage blood pressure. Restrict saturated and trans fats. Increase dietary intake of Omega-3 fatty acids (salmon, walnuts), leafy greens, whole grains, and antioxidant-rich fruits.",
            "Kidney Disease": "<strong>Renal Diet Guidelines:</strong> Carefully regulate dietary protein intake to reduce renal workload. Restrict sodium, potassium, and phosphorus. Limit foods like bananas, potatoes, dairy, and colas. Ensure fluid intake is matched with clinical fluid outputs.",
            "Fever": "<strong>Hydration-focused & Bland Diet:</strong> Prioritize electrolyte solutions, herbal teas, clear broths, and water to replace fluids lost due to sweating and hyperthermia. Eat soft, easily digestible meals (toast, plain rice, applesauce) in small, frequent portions.",
            "Respiratory Infection": "<strong>Immune-Support & Hydrating Diet:</strong> Focus on warm liquids (lemon-honey water, decaffeinated tea, warm broths) to soothe airways. Incorporate anti-inflammatory foods (garlic, ginger, turmeric) and vitamins rich in Zinc and Vitamin C (citrus, bell peppers).",
            "Not Available": "<strong>General Balanced Diet:</strong> Maintain balanced macronutrient proportions. Focus on fiber-rich whole foods, raw vegetables, clean proteins, and drink at least 2-3 liters of clean water daily. Avoid processed sugars and deep-fried foods."
        };

        const defaultDiet = "<strong>General Balanced Diet:</strong> Maintain balanced macronutrient proportions. Focus on fiber-rich whole foods, raw vegetables, clean proteins, and drink at least 2-3 liters of clean water daily. Avoid processed sugars and deep-fried foods.";
        dietSuggestionText.innerHTML = dietSuggestions[diseaseType] || defaultDiet;

        let medGuide = "";
        if (operationNeeded === "Yes") {
            medGuide += "<strong>⚠️ Pre-Operative Fasting (NPO):</strong> Patient is predicted to require surgery. Strict NPO (nothing by mouth/fasting) protocol must be initiated 8 hours prior to the scheduled procedure.<br><br>";
            medGuide += "<strong>💊 Pre-op Medication Guide:</strong> Consult with the anesthesia team regarding home medications. Anticoagulants (blood thinners), NSAIDs, and oral hypoglycemics must typically be held. Vital medications can be taken with a sip of water under directive.";
        } else {
            medGuide += "<strong>✅ Conservative Management:</strong> Maintain current medication adherence strictly. Do not stop or modify prescribed dosages without consulting your cardiologist or physician.<br><br>";
            medGuide += "<strong>🩺 Follow-up Care:</strong> Schedule a clinical reassessment in 7-14 days. Monitor daily vitals (BP, Heart Rate, SpO2) and seek immediate emergency care if symptoms worsen.";
        }

        if (medicationCount >= 6) {
            medGuide += `<br><br><span class="text-dangerRose font-bold"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Polypharmacy Warning:</span> The patient is currently prescribed ${medicationCount} medications. Recommend a complete clinical pharmacist reconciliation review to minimize drug-drug interactions and side effects.`;
        }

        medSuggestionText.innerHTML = medGuide;
        carePlanPanel.classList.remove('hidden');
    }

    operationNeededInput.addEventListener('change', () => {
        const baseData = getFormData();
        predictCost(baseData);
    });

    treatmentCostInput.addEventListener('change', () => {
        const baseData = getFormData();
        predictOperation(baseData);
    });

    // 5. Patient Directory & Dashboard Table Loader
    async function loadPatientsDirectory() {
        try {
            const response = await fetch('/api/patients');
            const data = await response.json();
            if (data.status === 'success') {
                patientsList = data.patients;
                renderPatientsTable();
                renderDashboardExplorerTable();
            } else {
                patientListBody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-textSec">Failed to load directory.</td></tr>';
            }
        } catch (error) {
            console.error("Error loading patient directory:", error);
            patientListBody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-textSec">Error loading directory.</td></tr>';
        }
    }

    function renderPatientsTable(filterText = '') {
        patientListBody.innerHTML = '';
        const search = filterText.toLowerCase();
        
        const filtered = patientsList.filter(p => {
            const name = (p.Patient_Name || '').toLowerCase();
            const disease = (p.Disease_Type || '').toLowerCase();
            const gender = (p.Gender || '').toLowerCase();
            return name.includes(search) || disease.includes(search) || gender.includes(search);
        });

        if (filtered.length === 0) {
            patientListBody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-textSec">No patients found.</td></tr>';
            return;
        }

        filtered.forEach(p => {
            const row = document.createElement('tr');
            row.className = "hover:bg-slate-50 transition-colors border-b border-slate-100";
            
            row.innerHTML = `
                <td class="p-4 font-semibold text-textDark">${p.Patient_Name}</td>
                <td class="p-4 text-textSec">${Math.round(p.Age)} / ${p.Gender}</td>
                <td class="p-4 text-textSec">${p.Blood_Group}</td>
                <td class="p-4 text-textSec">${p.Disease_Type}</td>
                <td class="p-4">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.Disease_Severity === 'High' ? 'bg-rose-50 text-rose-700' : p.Disease_Severity === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                    }">${p.Disease_Severity}</span>
                </td>
                <td class="p-4 text-textSec">${Math.round(p.Hospital_Stay_Days)} Days</td>
                <td class="p-4 font-semibold text-textDark">₹${Math.round(p.Treatment_Cost).toLocaleString()}</td>
                <td class="p-4">
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        p.Operation_Needed === 'Yes' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    }">${p.Operation_Needed === 'Yes' ? 'Yes' : 'No'}</span>
                </td>
                <td class="p-4">
                    <button type="button" class="load-btn px-3 py-1.5 bg-primaryBlue hover:bg-sky-600 text-white rounded-lg text-[10px] font-semibold transition-all hover-lift shadow-sm shadow-primaryBlue/10" data-id="${p.id}">
                        <i class="fa-solid fa-cloud-arrow-down mr-1"></i> Load
                    </button>
                </td>
            `;
            patientListBody.appendChild(row);
        });
    }

    function renderDashboardExplorerTable() {
        const tbody = document.getElementById('dashboard-table-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        patientsList.slice(0, 8).forEach(p => {
            const row = document.createElement('tr');
            row.className = "border-b border-slate-100 hover:bg-slate-50/50 transition-colors";
            row.innerHTML = `
                <td class="p-3 font-semibold text-textSec">#${1000 + p.id}</td>
                <td class="p-3 font-semibold text-textDark">${p.Patient_Name}</td>
                <td class="p-3 text-textSec">${Math.round(p.Age)} / ${p.Gender}</td>
                <td class="p-3 text-textSec">${p.Disease_Type}</td>
                <td class="p-3">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.Disease_Severity === 'High' ? 'bg-rose-50 text-rose-700' : p.Disease_Severity === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                    }">${p.Disease_Severity}</span>
                </td>
                <td class="p-3 text-textSec">${Math.round(p.Hospital_Stay_Days)}d</td>
                <td class="p-3 font-semibold text-textDark">₹${Math.round(p.Treatment_Cost).toLocaleString()}</td>
            `;
            tbody.appendChild(row);
        });
    }

    patientSearchInput.addEventListener('input', (e) => {
        renderPatientsTable(e.target.value.trim());
    });

    patientListBody.addEventListener('click', async (e) => {
        const loadBtn = e.target.closest('.load-btn');
        if (!loadBtn) return;
        
        const pId = parseInt(loadBtn.getAttribute('data-id'));
        const patient = patientsList.find(p => p.id === pId);
        if (!patient) return;
        
        for (const [key, val] of Object.entries(patient)) {
            const inputEl = document.getElementById(key);
            if (inputEl) {
                inputEl.value = val;
                if (inputEl.type === 'range') {
                    const labelVal = document.getElementById(`val-${key}`);
                    if (labelVal) labelVal.textContent = val;
                }
            }
        }
        
        patientDisplayName.textContent = `Patient: ${patient.Patient_Name}`;
        
        treatmentCostInput.value = Math.round(patient.Treatment_Cost);
        operationNeededInput.value = patient.Operation_Needed;
        
        gtCost.textContent = `₹${Math.round(patient.Treatment_Cost).toLocaleString()}`;
        gtOp.textContent = patient.Operation_Needed === 'Yes' ? 'Yes (Surgery)' : 'No (Stable)';
        gtOp.className = `gt-badge px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider border ${
            patient.Operation_Needed === 'Yes' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`;
        groundTruthPanel.classList.remove('hidden');
        
        switchTab('predictor');
        if (tabBtnDemographics) tabBtnDemographics.click();
        btnPredictBoth.click();
    });

    // 6. Fetch Analytics distributions & summaries
    async function loadAnalytics() {
        try {
            const response = await fetch('/api/analytics');
            const data = await response.json();
            if (data.status === 'success') {
                renderAnalyticsSummary(data.summary);
                renderAnalyticsCharts(data);
                renderDashboardIntegrity(data.summary);
            }
        } catch (error) {
            console.error("Error loading analytics:", error);
        }
    }

    function renderAnalyticsSummary(summary) {
        const container = document.getElementById('analytics-summary-cards');
        if (!container) return;
        container.innerHTML = `
            <div class="glass-card p-6 rounded-2xl hover-lift flex flex-col justify-between">
                <span class="text-xs text-textSec font-semibold uppercase tracking-wider">Average Treatment Cost</span>
                <div class="flex items-baseline space-x-1 mt-2">
                    <span class="text-2xl font-extrabold text-textDark">₹${summary.avg_price.toLocaleString()}</span>
                    <span class="text-[9px] text-textSec">per admission</span>
                </div>
            </div>
            <div class="glass-card p-6 rounded-2xl hover-lift flex flex-col justify-between">
                <span class="text-xs text-textSec font-semibold uppercase tracking-wider">Most Intensive Care</span>
                <div class="flex flex-col mt-2">
                    <span class="text-sm font-bold text-textDark truncate leading-snug">${summary.highest_cost.name}</span>
                    <span class="text-[9px] text-rose-600 font-extrabold mt-0.5">₹${summary.highest_cost.cost.toLocaleString()} (${summary.highest_cost.disease})</span>
                </div>
            </div>
            <div class="glass-card p-6 rounded-2xl hover-lift flex flex-col justify-between">
                <span class="text-xs text-textSec font-semibold uppercase tracking-wider">ICU Admission Rate</span>
                <div class="flex items-baseline space-x-1 mt-2">
                    <span class="text-2xl font-extrabold text-textDark">${summary.icu_rate}%</span>
                    <span class="text-[9px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">Critical</span>
                </div>
            </div>
            <div class="glass-card p-6 rounded-2xl hover-lift flex flex-col justify-between">
                <span class="text-xs text-textSec font-semibold uppercase tracking-wider">Average Stay Days</span>
                <div class="flex items-baseline space-x-1 mt-2">
                    <span class="text-2xl font-extrabold text-textDark">${summary.avg_stay} Days</span>
                    <span class="text-[9px] text-textSec">General Recovery</span>
                </div>
            </div>
        `;
    }

    function renderDashboardIntegrity(summary) {
        const grid = document.getElementById('dashboard-stats-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="glass-card p-6 rounded-2xl flex flex-col justify-between hover-lift">
                    <span class="text-xs text-textSec font-semibold uppercase tracking-wider">Active Patient Logs</span>
                    <div class="flex items-baseline space-x-1.5 mt-2">
                        <span class="text-2xl sm:text-3xl font-heading font-extrabold text-textDark">10,000+</span>
                        <span class="text-[9px] font-bold text-successGreen bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100">Live</span>
                    </div>
                </div>
                <div class="glass-card p-6 rounded-2xl flex flex-col justify-between hover-lift">
                    <span class="text-xs text-textSec font-semibold uppercase tracking-wider">Avg Cost</span>
                    <div class="flex items-baseline space-x-1.5 mt-2">
                        <span class="text-2xl sm:text-3xl font-heading font-extrabold text-textDark">₹${(summary.avg_price/1000).toFixed(0)}K</span>
                        <span class="text-[9px] text-textSec">Indian Market</span>
                    </div>
                </div>
                <div class="glass-card p-6 rounded-2xl flex flex-col justify-between hover-lift">
                    <span class="text-xs text-textSec font-semibold uppercase tracking-wider">ICU Admission</span>
                    <div class="flex items-baseline space-x-1.5 mt-2">
                        <span class="text-2xl sm:text-3xl font-heading font-extrabold text-textDark">${summary.icu_rate}%</span>
                        <span class="text-[9px] font-bold text-primaryBlue bg-sky-50 px-1.5 py-0.5 rounded-full">Monitored</span>
                    </div>
                </div>
                <div class="glass-card p-6 rounded-2xl flex flex-col justify-between hover-lift">
                    <span class="text-xs text-textSec font-semibold uppercase tracking-wider">Longest Stay Patient</span>
                    <div class="flex flex-col mt-2">
                        <span class="text-xs font-bold text-textDark truncate leading-snug">${summary.longest_stay.name}</span>
                        <span class="text-[9px] text-textSec font-medium mt-0.5">${summary.longest_stay.days}d (${summary.longest_stay.disease})</span>
                    </div>
                </div>
            `;
        }

        const integrity = document.getElementById('dashboard-integrity-stats');
        if (integrity) {
            integrity.innerHTML = `
                <div class="flex justify-between items-center py-2.5 border-b border-slate-100">
                    <span class="text-xs text-textSec font-semibold">Hospital Dataset</span>
                    <span class="text-xs font-bold text-textDark">Excel File</span>
                </div>
                <div class="flex justify-between items-center py-2.5 border-b border-slate-100">
                    <span class="text-xs text-textSec font-semibold">Outliers / Null checks</span>
                    <span class="text-xs font-bold text-successGreen">0 missing</span>
                </div>
                <div class="flex justify-between items-center py-2.5 border-b border-slate-100">
                    <span class="text-xs text-textSec font-semibold">Duplicates removed</span>
                    <span class="text-xs font-bold text-textDark">Completed</span>
                </div>
                <div class="flex justify-between items-center py-2.5">
                    <span class="text-xs text-textSec font-semibold">Clinical Features</span>
                    <span class="text-xs font-bold text-primaryBlue">27 Parameters</span>
                </div>
            `;
        }
    }

    function renderAnalyticsCharts(data) {
        const catLabels = Object.keys(data.category_distribution);
        const catValues = Object.values(data.category_distribution);
        const catCtx = document.getElementById('chart-cat-dist').getContext('2d');
        if (charts.catDist) charts.catDist.destroy();
        charts.catDist = new Chart(catCtx, {
            type: 'doughnut',
            data: {
                labels: catLabels,
                datasets: [{
                    data: catValues,
                    backgroundColor: ['#0284c7', '#8b5cf6', '#0d9488', '#10b981', '#f43f5e', '#f59e0b', '#64748b'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 10, font: { family: 'Poppins', size: 9 } } }
                }
            }
        });

        const sevLabels = Object.keys(data.severity_avg_cost);
        const sevValues = Object.values(data.severity_avg_cost);
        const brandCtx = document.getElementById('chart-brand-dist').getContext('2d');
        if (charts.brandDist) charts.brandDist.destroy();
        charts.brandDist = new Chart(brandCtx, {
            type: 'bar',
            data: {
                labels: sevLabels,
                datasets: [{
                    label: 'Avg Treatment Cost',
                    data: sevValues,
                    backgroundColor: 'rgba(2, 132, 199, 0.75)',
                    hoverBackgroundColor: '#0284c7',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { family: 'Poppins', size: 9 } } },
                    y: { grid: { display: false }, ticks: { font: { family: 'Poppins', size: 9 } } }
                }
            }
        });

        const priceLabels = Object.keys(data.price_distribution);
        const priceValues = Object.values(data.price_distribution);
        const priceCtx = document.getElementById('chart-price-dist').getContext('2d');
        if (charts.priceDist) charts.priceDist.destroy();
        charts.priceDist = new Chart(priceCtx, {
            type: 'bar',
            data: {
                labels: priceLabels,
                datasets: [{
                    label: 'Patient Count',
                    data: priceValues,
                    backgroundColor: 'rgba(139, 92, 246, 0.75)',
                    hoverBackgroundColor: '#8b5cf6',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { family: 'Poppins', size: 9 } } },
                    y: { grid: { display: false }, ticks: { font: { family: 'Poppins', size: 9 } } }
                }
            }
        });

        const ageLabels = Object.keys(data.age_distribution);
        const ageValues = Object.values(data.age_distribution);
        const ageCtx = document.getElementById('chart-rating-dist').getContext('2d');
        if (charts.ageDist) charts.ageDist.destroy();
        charts.ageDist = new Chart(ageCtx, {
            type: 'bar',
            data: {
                labels: ageLabels,
                datasets: [{
                    label: 'Patient Count',
                    data: ageValues,
                    backgroundColor: 'rgba(13, 148, 136, 0.75)',
                    hoverBackgroundColor: '#0d9488',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { family: 'Poppins', size: 9 } } },
                    y: { grid: { display: false }, ticks: { font: { family: 'Poppins', size: 9 } } }
                }
            }
        });
    }

    // 7. Machine Learning Tab dynamic visualizer
    async function loadMlInsights() {
        try {
            const response = await fetch('/api/ml-insights');
            mlInsightsData = await response.json();
            
            if (mlInsightsData.initialized === false) {
                renderMlFallback(mlInsightsData.error);
            } else {
                renderMlMetrics(mlInsightsData.metrics);
                toggleMlLock(false);
                renderMlChart();
            }
        } catch (error) {
            console.error("Error loading ML insights:", error);
            renderMlFallback(error.message || error);
        }
    }

    function toggleMlLock(isLocked) {
        const fallback = document.getElementById('ml-chart-fallback');
        const canvas = document.getElementById('chart-ml-visualizer');
        if (fallback) {
            if (isLocked) {
                fallback.classList.remove('hidden');
                if (canvas) canvas.classList.add('invisible');
            } else {
                fallback.classList.add('hidden');
                if (canvas) canvas.classList.remove('invisible');
            }
        }
    }

    function renderMlFallback(errorMsg) {
        toggleMlLock(true);
        const container = document.getElementById('ml-metrics-content');
        if (!container) return;
        container.innerHTML = `
            <div class="p-6 bg-rose-50/40 border border-rose-100 rounded-2xl text-center space-y-4 shadow-sm">
                <div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 mb-1">
                    <i class="fa-solid fa-triangle-exclamation text-lg"></i>
                </div>
                <h4 class="text-sm font-bold text-slate-800">Model Pipeline Offline</h4>
                <p class="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                     Pickle model configurations could not be resolved from models directory.
                </p>
                <div class="p-3 bg-white border border-rose-100 rounded-xl text-left text-[10px] font-mono text-rose-600 max-h-24 overflow-y-auto custom-scrollbar break-all">
                    ${errorMsg || 'Pickle model files missing or failed to unpickle.'}
                </div>
            </div>
        `;
    }

    function renderMlMetrics(metrics) {
        const container = document.getElementById('ml-metrics-content');
        if (!container) return;
        
        document.getElementById('hero-model-metric').textContent = `Decision Tree Accuracy: ${(metrics.clf_accuracy * 100).toFixed(1)}%`;
        
        container.innerHTML = `
            <div class="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-bold text-textDark">Treatment Cost Model</span>
                    <span class="text-[9px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-bold uppercase">DT Regressor</span>
                </div>
                <div class="flex justify-between items-baseline mt-2">
                    <span class="text-xs text-textSec">R² Score</span>
                    <span class="text-xl font-extrabold text-primaryBlue">${(metrics.reg_r2 * 100).toFixed(2)}%</span>
                </div>
                <div class="bg-slate-200 h-1.5 rounded-full mt-2.5 overflow-hidden">
                    <div class="bg-primaryBlue h-full rounded-full" style="width: ${metrics.reg_r2 * 100}%"></div>
                </div>
                <div class="grid grid-cols-2 gap-4 mt-4 text-[10px] text-textSec">
                    <div>MAE: <strong class="text-textDark">${metrics.reg_mae.toFixed(1)}</strong></div>
                    <div>RMSE: <strong class="text-textDark">${metrics.reg_rmse.toFixed(1)}</strong></div>
                </div>
            </div>

            <div class="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-bold text-textDark">Surgical Predictor Model</span>
                    <span class="text-[9px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-bold uppercase">DT Classifier</span>
                </div>
                <div class="flex justify-between items-baseline mt-2">
                    <span class="text-xs text-textSec">Accuracy</span>
                    <span class="text-xl font-extrabold text-accentViolet">${(metrics.clf_accuracy * 100).toFixed(2)}%</span>
                </div>
                <div class="bg-slate-200 h-1.5 rounded-full mt-2.5 overflow-hidden">
                    <div class="bg-accentViolet h-full rounded-full" style="width: ${metrics.clf_accuracy * 100}%"></div>
                </div>
                <div class="grid grid-cols-2 gap-4 mt-4 text-[10px] text-textSec">
                    <div>Train Time: <strong class="text-textDark">${metrics.clf_train_time.toFixed(4)}s</strong></div>
                    <div>Pred Time: <strong class="text-textDark">${metrics.clf_pred_time.toFixed(5)}s</strong></div>
                </div>
            </div>

            <div class="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs space-y-2 text-textSec">
                <div class="flex justify-between">
                    <span>Regressor CV Score</span>
                    <strong class="text-textDark">${(metrics.reg_cv * 100).toFixed(2)}%</strong>
                </div>
                <div class="flex justify-between">
                    <span>Train-Test Split</span>
                    <strong class="text-textDark">80% / 20%</strong>
                </div>
                <div class="flex justify-between">
                    <span>Random State</span>
                    <strong class="text-textDark">42</strong>
                </div>
            </div>
        `;
    }

    window.renderMlChart = function() {
        const canvas = document.getElementById('chart-ml-visualizer');
        if (!mlInsightsData || !canvas) return;

        const selection = document.getElementById('ml-chart-selector').value;
        const ctx = canvas.getContext('2d');
        
        if (charts.mlVisualizer) charts.mlVisualizer.destroy();

        const alertTitle = document.querySelector('#ml-chart-alert h4');
        const alertDesc = document.querySelector('#ml-chart-alert-desc');
        const alertBox = document.getElementById('ml-chart-alert');

        if (selection === 'importance') {
            alertBox.classList.remove('hidden');
            alertTitle.innerText = "🏆 Regressor Feature Importance";
            alertDesc.innerText = "This graph maps parameters affecting clinical cost evaluations. Stay duration, age, and disease severity splits are the primary drivers.";

            const labels = Object.keys(mlInsightsData.reg_feature_importance).map(l => l.replace(/_/g, ' '));
            const values = Object.values(mlInsightsData.reg_feature_importance).map(v => v * 100);

            charts.mlVisualizer = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: 'rgba(2, 132, 199, 0.75)',
                        hoverBackgroundColor: '#0284c7',
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { title: { display: true, text: 'Importance Weight (%)', font: { family: 'Poppins', size: 10 } } },
                        y: { ticks: { font: { family: 'Poppins', size: 9 } } }
                    }
                }
            });
        } 
        else if (selection === 'importance_clf') {
            alertBox.classList.remove('hidden');
            alertTitle.innerText = "🏆 Classifier Feature Importance";
            alertDesc.innerText = "Ranks patient factors driving predicted surgical needs. Vitals like SpO2 levels and condition severity dominate node decisions.";

            const labels = Object.keys(mlInsightsData.clf_feature_importance).map(l => l.replace(/_/g, ' '));
            const values = Object.values(mlInsightsData.clf_feature_importance).map(v => v * 100);

            charts.mlVisualizer = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: 'rgba(139, 92, 246, 0.75)',
                        hoverBackgroundColor: '#8b5cf6',
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { title: { display: true, text: 'Importance Weight (%)', font: { family: 'Poppins', size: 10 } } },
                        y: { ticks: { font: { family: 'Poppins', size: 9 } } }
                    }
                }
            });
        } 
        else if (selection === 'heatmap') {
            alertBox.add('hidden');
            const labels = mlInsightsData.correlation_heatmap.labels.map(l => l.replace(/_/g, ' '));
            const matrix = mlInsightsData.correlation_heatmap.matrix;
            const scatterData = [];

            for (let i = 0; i < labels.length; i++) {
                for (let j = 0; j < labels.length; j++) {
                    scatterData.push({ x: i, y: j, v: matrix[i][j] });
                }
            }

            charts.mlVisualizer = new Chart(ctx, {
                type: 'bubble',
                data: {
                    datasets: [{
                        label: 'Correlation Value',
                        data: scatterData.map(d => ({ x: d.x, y: d.y, r: Math.abs(d.v) * 20 + 2 })),
                        backgroundColor: scatterData.map(d => {
                            return d.v > 0 ? `rgba(2, 132, 199, ${Math.abs(d.v)})` : `rgba(244, 63, 94, ${Math.abs(d.v)})`;
                        })
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const raw = scatterData[context.dataIndex];
                                    return `${labels[raw.x]} vs ${labels[raw.y]}: ${raw.v}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { ticks: { callback: value => labels[value], font: { family: 'Poppins', size: 9 } } },
                        y: { ticks: { callback: value => labels[value], font: { family: 'Poppins', size: 9 } } }
                    }
                }
            });
        } 
        else if (selection === 'scatter') {
            alertBox.classList.remove('hidden');
            alertTitle.innerText = "📈 Cost vs Hospital Stay duration correlation";
            alertDesc.innerText = "Maps patient dataset logs to inspect how stay length impacts overall treatment costs. Linear regression trend shows strong positive association.";

            const scatterPoints = mlInsightsData.actual_vs_predicted.map(pt => ({
                x: pt.actual_rating,
                y: pt.predicted_score
            }));

            charts.mlVisualizer = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Patient Cost Logs',
                        data: scatterPoints,
                        backgroundColor: 'rgba(13, 148, 136, 0.75)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { title: { display: true, text: 'Stay Duration (Days)', font: { family: 'Poppins' } }, ticks: { font: { family: 'Poppins', size: 9 } } },
                        y: { title: { display: true, text: 'Treatment Cost (₹)', font: { family: 'Poppins' } }, ticks: { font: { family: 'Poppins', size: 9 } } }
                    }
                }
            });
        }
    };

    window.toggleMobileMenu = function(forceState) {
        const menu = document.getElementById('mobile-nav-menu');
        const hamburger = document.getElementById('hamburger-icon');
        const closeIcon = document.getElementById('close-icon');
        
        if (!menu) return;
        let show = menu.classList.contains('hidden');
        if (forceState !== undefined) show = forceState;
        
        if (show) {
            menu.classList.remove('hidden');
            hamburger.classList.add('hidden');
            closeIcon.classList.remove('hidden');
        } else {
            menu.classList.add('hidden');
            hamburger.classList.remove('hidden');
            closeIcon.classList.add('hidden');
        }
    };

    window.switchTab = function(tabId) {
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.className = "nav-btn px-4 py-2 rounded-lg text-xs font-semibold tracking-wide uppercase transition-all text-textSec hover:text-textDark";
        });
        document.querySelectorAll('.mobile-nav-btn').forEach(b => {
            b.className = "mobile-nav-btn w-full text-left px-4 py-3 rounded-xl text-sm font-semibold uppercase tracking-wide transition-all text-textSec hover:text-textDark hover:bg-slate-50";
        });

        const panel = document.getElementById(`tab-${tabId}`);
        if (panel) panel.classList.add('active');
        
        const navBtn = document.getElementById(`nav-${tabId}`);
        if (navBtn) {
            navBtn.className = "nav-btn px-4 py-2 rounded-lg text-xs font-bold tracking-wide uppercase transition-all bg-primaryBlue text-white shadow-sm shadow-primaryBlue/15";
        }
        const mobileNavBtn = document.getElementById(`mobile-nav-${tabId}`);
        if (mobileNavBtn) {
            mobileNavBtn.className = "mobile-nav-btn w-full text-left px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wide transition-all bg-sky-50 text-primaryBlue";
        }
        
        if (tabId === 'ml') {
            setTimeout(renderMlChart, 200);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Init Calls
    switchTab('dashboard');
    loadMetadata();
    loadLocalFeatureImportances();
    loadPatientsDirectory();
    loadAnalytics();
    loadMlInsights();
});
