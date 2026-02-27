"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compressPaymentFile, formatBytes, PAYMENT_MAX_FILE_BYTES } from "../lib/clientFileCompression";

const modalId = "registration-form";
const FIXED_CATEGORY = "15km";
const FIXED_PAYMENT_METHOD = "GCash";
const GCASH_QR_SRC = "/assets/images/qr.jpg";
const TRAIL_REGISTRATION_TOTAL = "1500";

const initialForm = {
  email: "",
  fname: "",
  mname: "",
  lname: "",
  gender: "",
  nationality: "",
  province_state: "",
  city_municipality: "",
  barangay: "",
  zip_code: "",
  contact_no: "",
  health_condition: "",
  health_condition_details: "",
  category: FIXED_CATEGORY,
  shirt_size: "",
  emergency_full_name: "",
  emergency_contact_no: "",
  payment_method: FIXED_PAYMENT_METHOD,
  gcash_number: "",
  amount_to_be_paid: TRAIL_REGISTRATION_TOTAL
};

const fields = {
  email: { label: "Email", type: "email", required: true },
  fname: { label: "First Name", type: "text", required: true },
  mname: { label: "Middle Name (Optional)", type: "text" },
  lname: { label: "Last Name", type: "text", required: true },
  gender: { label: "Gender", type: "select", required: true, options: ["Male", "Female"] },
  nationality: { label: "Nationality", type: "text", required: true },
  province_state: { label: "Province / State", type: "custom", required: true },
  city_municipality: { label: "City / Municipality", type: "custom", required: true },
  barangay: { label: "Barangay", type: "custom", required: true },
  zip_code: { label: "ZIP Code / Postal Code", type: "text", required: true },
  contact_no: { label: "Contact No", type: "tel", required: true },
  health_condition_group: { label: "Health Condition", type: "custom", required: true },
  category: { label: "Category", type: "select", required: true, options: [FIXED_CATEGORY] },
  shirt_size: { label: "Shirt Size", type: "select", required: true, options: ["XS", "S", "M", "L", "XL", "XXL"] },
  emergency_full_name: { label: "Emergancy Contact Full Name", type: "text", required: true },
  emergency_contact_no: { label: "Emergency Contact Number", type: "tel", required: true },
  payment_method: { label: "Payment Method", type: "select", required: true, options: [FIXED_PAYMENT_METHOD] },
  gcash_qr: { label: "GCash QR", type: "custom" },
  proof_of_payment_file: { label: "Proof Of Payment (File)", type: "file" }
};

const steps = [
  {
    title: "Personal Information",
    keys: ["email", "fname", "mname", "lname", "dob_group"]
  },
  {
    title: "Contact Information",
    keys: ["gender", "nationality", "province_state", "city_municipality", "barangay", "zip_code", "health_condition_group"]
  },
  {
    title: "Event & Emergency",
    keys: ["contact_no", "category", "shirt_size", "emergency_full_name", "emergency_contact_no"]
  },
  {
    title: "Trail Run Registration",
    keys: ["gcash_qr", "proof_of_payment_file"]
  }
];

function isBlank(value) {
  return !String(value || "").trim();
}

const monthOptions = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" }
];

const dayOptions = Array.from({ length: 31 }, (_, index) => String(index + 1));

function buildDob(parts) {
  const month = Number(parts.month);
  const day = Number(parts.day);
  const year = Number(parts.year);

  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) {
    return null;
  }

  const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  const isValid =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day;

  return isValid ? isoDate : null;
}

export default function RegistrationForm() {
  const [form, setForm] = useState(initialForm);
  const [provinceOptions, setProvinceOptions] = useState([]);
  const [municipalityOptions, setMunicipalityOptions] = useState([]);
  const [barangayOptions, setBarangayOptions] = useState([]);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState("");
  const [selectedMunicipalityCode, setSelectedMunicipalityCode] = useState("");
  const [selectedBarangayCode, setSelectedBarangayCode] = useState("");
  const [isLoadingProvinces, setIsLoadingProvinces] = useState(false);
  const [isLoadingBarangays, setIsLoadingBarangays] = useState(false);
  const [dobParts, setDobParts] = useState({ month: "", day: "", year: "" });
  const [proofFile, setProofFile] = useState(null);
  const [proofFileMeta, setProofFileMeta] = useState({
    name: "",
    originalSize: 0,
    finalSize: 0,
    wasCompressed: false
  });
  const [isProcessingProofFile, setIsProcessingProofFile] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [toast, setToast] = useState({ show: false, type: "success", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [privacyConfirm, setPrivacyConfirm] = useState({ open: false, dob: "" });
  const [stepIndex, setStepIndex] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isQrCompactViewport, setIsQrCompactViewport] = useState(false);
  const latestBarangayLoadRef = useRef(0);
  const modalRef = useRef(null);
  const formRef = useRef(null);

  const canSubmit = useMemo(() => !isSubmitting && !isProcessingProofFile, [isProcessingProofFile, isSubmitting]);
  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const filteredBarangayOptions = useMemo(() => {
    if (!selectedMunicipalityCode) {
      return [];
    }
    return barangayOptions.filter((option) => option.mun_city_code === selectedMunicipalityCode);
  }, [barangayOptions, selectedMunicipalityCode]);
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: currentYear - 1930 + 1 }, (_, index) => String(currentYear - index));
  }, []);

  const openModal = () => {
    const bootstrapModal = globalThis.bootstrap?.Modal;
    if (!bootstrapModal || !modalRef.current) {
      return;
    }
    bootstrapModal.getOrCreateInstance(modalRef.current).show();
  };

  useEffect(() => {
    const ctaLinks = document.querySelectorAll(`a.register-cta-btn[href="#${modalId}"]`);
    const handleClick = (event) => {
      event.preventDefault();
      openModal();
    };

    ctaLinks.forEach((link) => link.addEventListener("click", handleClick));
    return () => {
      ctaLinks.forEach((link) => link.removeEventListener("click", handleClick));
    };
  }, []);

  useEffect(() => {
    if (globalThis.location?.hash === `#${modalId}`) {
      openModal();
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 575px)");
    const applyState = () => setIsMobileViewport(mediaQuery.matches);
    applyState();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", applyState);
      return () => mediaQuery.removeEventListener("change", applyState);
    }

    mediaQuery.addListener(applyState);
    return () => mediaQuery.removeListener(applyState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const applyState = () => setIsQrCompactViewport(mediaQuery.matches);
    applyState();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", applyState);
      return () => mediaQuery.removeEventListener("change", applyState);
    }

    mediaQuery.addListener(applyState);
    return () => mediaQuery.removeListener(applyState);
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadProvinces = async () => {
      setIsLoadingProvinces(true);
      try {
        const response = await fetch("/api/ph-locations", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Failed to load provinces.");
        }
        if (!isActive) {
          return;
        }
        const next = Array.isArray(payload.provinces) ? payload.provinces : [];
        setProvinceOptions(next);
      } catch (error) {
        if (!isActive) {
          return;
        }
        setStatus({
          type: "error",
          message: error instanceof Error ? error.message : "Failed to load provinces."
        });
      } finally {
        if (isActive) {
          setIsLoadingProvinces(false);
        }
      }
    };

    loadProvinces();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedProvinceCode) {
      setMunicipalityOptions([]);
      setBarangayOptions([]);
      setIsLoadingBarangays(false);
      return;
    }

    const loadId = latestBarangayLoadRef.current + 1;
    latestBarangayLoadRef.current = loadId;
    setIsLoadingBarangays(true);

    const loadBarangays = async () => {
      try {
        const response = await fetch(`/api/ph-locations?provinceCode=${encodeURIComponent(selectedProvinceCode)}`, {
          cache: "no-store"
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Failed to load barangays.");
        }
        if (latestBarangayLoadRef.current !== loadId) {
          return;
        }
        const municipalities = Array.isArray(payload.municipalities) ? payload.municipalities : [];
        const next = Array.isArray(payload.barangays) ? payload.barangays : [];
        setMunicipalityOptions(municipalities);
        setBarangayOptions(next);
      } catch (error) {
        if (latestBarangayLoadRef.current !== loadId) {
          return;
        }
        setMunicipalityOptions([]);
        setBarangayOptions([]);
        setStatus({
          type: "error",
          message: error instanceof Error ? error.message : "Failed to load barangays."
        });
      } finally {
        if (latestBarangayLoadRef.current === loadId) {
          setIsLoadingBarangays(false);
        }
      }
    };

    loadBarangays();
  }, [selectedProvinceCode]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => {
      if (name === "health_condition") {
        return {
          ...prev,
          health_condition: value,
          health_condition_details: value === "Yes" ? prev.health_condition_details : ""
        };
      }

      if (name === "zip_code") {
        return { ...prev, zip_code: value.replace(/\D/g, "").slice(0, 4) };
      }

      return { ...prev, [name]: value };
    });
  };

  const handleProvinceChange = (event) => {
    const code = event.target.value;
    const selected = provinceOptions.find((option) => option.code === code);
    setSelectedProvinceCode(code);
    setSelectedMunicipalityCode("");
    setSelectedBarangayCode("");
    setMunicipalityOptions([]);
    setBarangayOptions([]);
    setForm((prev) => ({
      ...prev,
      province_state: selected ? selected.name : "",
      city_municipality: "",
      barangay: "",
      zip_code: ""
    }));
  };

  const handleMunicipalityChange = (event) => {
    const code = event.target.value;
    const selected = municipalityOptions.find((option) => option.code === code);
    setSelectedMunicipalityCode(code);
    setSelectedBarangayCode("");
    setForm((prev) => ({
      ...prev,
      city_municipality: selected ? selected.name : "",
      barangay: "",
      zip_code: ""
    }));
  };

  const handleBarangayChange = (event) => {
    const code = event.target.value;
    const selected = filteredBarangayOptions.find((option) => option.code === code);
    setSelectedBarangayCode(code);
    setForm((prev) => ({
      ...prev,
      barangay: selected ? selected.name : "",
      city_municipality: selected ? selected.city_municipality : prev.city_municipality,
      zip_code: selected ? selected.zip_code : ""
    }));
  };

  const handleFileChange = async (event) => {
    const inputElement = event.target;
    const selected = inputElement.files && inputElement.files[0] ? inputElement.files[0] : null;
    if (!selected) {
      setProofFile(null);
      setProofFileMeta({ name: "", originalSize: 0, finalSize: 0, wasCompressed: false });
      return;
    }

    setIsProcessingProofFile(true);
    setStatus({ type: "", message: "" });

    try {
      const compressed = await compressPaymentFile(selected);
      setProofFile(compressed.file);
      setProofFileMeta({
        name: compressed.file.name,
        originalSize: compressed.originalSize,
        finalSize: compressed.finalSize,
        wasCompressed: compressed.wasCompressed
      });
      setStatus({
        type: "success",
        message: compressed.wasCompressed
          ? `Payment file compressed: ${formatBytes(compressed.originalSize)} -> ${formatBytes(compressed.finalSize)}.`
          : `Payment file ready: ${formatBytes(compressed.finalSize)}.`
      });
    } catch (error) {
      inputElement.value = "";
      setProofFile(null);
      setProofFileMeta({ name: "", originalSize: 0, finalSize: 0, wasCompressed: false });
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to process payment file."
      });
    } finally {
      setIsProcessingProofFile(false);
    }
  };

  const handleDobPartChange = (part) => (event) => {
    setDobParts((prev) => ({ ...prev, [part]: event.target.value }));
  };

  const showToast = (message, type = "success") => {
    setToast({ show: true, type, message });
  };

  useEffect(() => {
    if (!toast.show) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 4200);

    return () => window.clearTimeout(timeoutId);
  }, [toast.show]);

  const validateStep = (index) => {
    if (isProcessingProofFile) {
      setStatus({ type: "error", message: "Please wait while your payment file is being compressed." });
      return false;
    }

    const step = steps[index];
    for (const key of step.keys) {
      if (key === "dob_group") {
        if (!buildDob(dobParts)) {
          setStatus({ type: "error", message: "Please select a valid Date of Birth (Month, Day, Year)." });
          return false;
        }
        continue;
      }

      if (key === "gcash_qr") {
        continue;
      }

      if (key === "proof_of_payment_file") {
        continue;
      }

      if (key === "health_condition_group") {
        if (isBlank(form.health_condition)) {
          setStatus({ type: "error", message: "Please select: Health Condition" });
          return false;
        }
        if (form.health_condition === "Yes" && isBlank(form.health_condition_details)) {
          setStatus({ type: "error", message: "Please specify your health condition." });
          return false;
        }
        continue;
      }

      const config = fields[key];
      if (config.required && isBlank(form[key])) {
        setStatus({ type: "error", message: `Please fill out: ${config.label}` });
        return false;
      }
      if (key === "zip_code" && !/^\d{4}$/.test(String(form.zip_code || "").trim())) {
        setStatus({ type: "error", message: "ZIP Code / Postal Code must be exactly 4 digits." });
        return false;
      }
      if (key === "amount_to_be_paid") {
        const amount = Number(form.amount_to_be_paid);
        if (!Number.isFinite(amount) || amount < 0) {
          setStatus({ type: "error", message: "Amount To Be Paid must be a valid non-negative number." });
          return false;
        }
      }
    }

    if (index === steps.length - 1) {
      if (!proofFile) {
        setStatus({ type: "error", message: "Upload proof of payment file." });
        return false;
      }
      if (!accepted) {
        setStatus({ type: "error", message: "Please accept the Principle of Accuracy before submitting." });
        return false;
      }
    }

    setStatus({ type: "", message: "" });
    return true;
  };

  const handleNext = () => {
    if (!validateStep(stepIndex)) {
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setStatus({ type: "", message: "" });
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const submitRegistration = async (dob, consentAtIso) => {
    setIsSubmitting(true);
    setStatus({ type: "", message: "" });

    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, value));
      payload.append("dob", dob);
      payload.append("privacy_consent", "true");
      payload.append("privacy_consent_at", consentAtIso);
      if (proofFile) {
        payload.append("proof_of_payment_file", proofFile);
      }

      const response = await fetch("/api/register", {
        method: "POST",
        body: payload
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Registration failed.");
      }

      setStatus({
        type: "success",
        message: `Registration saved. Client ID: ${body.clientId}, Payment ID: ${body.paymentId}`
      });
      showToast("Registration submitted successfully. Thank you!");
      setForm(initialForm);
      setSelectedProvinceCode("");
      setSelectedMunicipalityCode("");
      setSelectedBarangayCode("");
      setMunicipalityOptions([]);
      setBarangayOptions([]);
      setDobParts({ month: "", day: "", year: "" });
      setProofFile(null);
      setProofFileMeta({ name: "", originalSize: 0, finalSize: 0, wasCompressed: false });
      setAccepted(false);
      setStepIndex(0);
      if (formRef.current) {
        formRef.current.reset();
      }
    } catch (error) {
      showToast("Submission failed. Please check the form and try again.", "error");
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Registration failed."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isProcessingProofFile) {
      setStatus({ type: "error", message: "Please wait while your payment file is being compressed." });
      return;
    }
    if (!validateStep(stepIndex)) {
      return;
    }

    const dob = buildDob(dobParts);
    if (!dob) {
      setStatus({ type: "error", message: "Please select a valid Date of Birth (Month, Day, Year)." });
      return;
    }

    setStatus({ type: "", message: "" });
    setPrivacyConfirm({ open: true, dob });
  };

  const handlePrivacyCancel = () => {
    setPrivacyConfirm({ open: false, dob: "" });
  };

  const handlePrivacyConfirm = async () => {
    if (isSubmitting) {
      return;
    }
    if (!privacyConfirm.dob) {
      setPrivacyConfirm({ open: false, dob: "" });
      setStatus({
        type: "error",
        message: "Registration canceled. Please submit again."
      });
      return;
    }

    const dob = privacyConfirm.dob;
    const consentAtIso = new Date().toISOString();
    setPrivacyConfirm({ open: false, dob: "" });
    await submitRegistration(dob, consentAtIso);
  };

  const renderField = (key) => {
    if (key === "dob_group") {
      return (
        <div key={key} className="col-12">
          <label className="form-label">Date of Birth</label>
          <div className="row g-2">
            <div className="col-md-4 col-12">
              <select
                className="form-select registration-input"
                value={dobParts.month}
                onChange={handleDobPartChange("month")}
                required
              >
                <option value="">Month</option>
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="col-md-4 col-12">
              <select
                className="form-select registration-input"
                value={dobParts.day}
                onChange={handleDobPartChange("day")}
                required
              >
                <option value="">Day</option>
                {dayOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="col-md-4 col-12">
              <select
                className="form-select registration-input"
                value={dobParts.year}
                onChange={handleDobPartChange("year")}
                required
              >
                <option value="">Year</option>
                {yearOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      );
    }

    const config = fields[key];

    if (key === "gcash_qr") {
      return (
        <div key={key} className="col-12">
          <label className="form-label">Scan GCash QR Code</label>
          <div
            className="registration-qr-panel"
            style={
              isQrCompactViewport
                ? { maxWidth: "240px", padding: "0.5rem", marginLeft: "auto", marginRight: "auto" }
                : undefined
            }
          >
            <img
              src={GCASH_QR_SRC}
              alt="GCash QR Code"
              className="registration-qr-image"
              loading="lazy"
              decoding="async"
              style={isQrCompactViewport ? { width: "190px", maxWidth: "100%", maxHeight: "190px", height: "auto" } : undefined}
            />
            <p className="registration-qr-text mb-0">
              Scan this QR code in GCash, then upload your proof of payment below.
            </p>
          </div>
        </div>
      );
    }

    if (key === "province_state") {
      return (
        <div key={key} className="col-12">
          <label htmlFor="province_state" className="form-label">Province / State</label>
          <select
            id="province_state"
            name="province_state"
            className="form-select registration-input"
            value={selectedProvinceCode}
            onChange={handleProvinceChange}
            required
            disabled={isLoadingProvinces}
          >
            <option value="">
              {isLoadingProvinces ? "Loading provinces..." : "Select Province / State"}
            </option>
            {provinceOptions.map((option) => (
              <option key={option.code} value={option.code}>{option.name}</option>
            ))}
          </select>
        </div>
      );
    }

    if (key === "city_municipality") {
      return (
        <div key={key} className="col-12">
          <label htmlFor="city_municipality" className="form-label">City / Municipality</label>
          <select
            id="city_municipality"
            name="city_municipality"
            className="form-select registration-input"
            value={selectedMunicipalityCode}
            onChange={handleMunicipalityChange}
            required
            disabled={!selectedProvinceCode || isLoadingBarangays}
          >
            <option value="">
              {!selectedProvinceCode
                ? "Select Province / State first"
                : isLoadingBarangays
                  ? "Loading cities/municipalities..."
                  : "Select City / Municipality"}
            </option>
            {municipalityOptions.map((option) => (
              <option key={option.code} value={option.code}>{option.name}</option>
            ))}
          </select>
        </div>
      );
    }

    if (key === "barangay") {
      return (
        <div key={key} className="col-12">
          <label htmlFor="barangay" className="form-label">Barangay</label>
          <select
            id="barangay"
            name="barangay"
            className="form-select registration-input"
            value={selectedBarangayCode}
            onChange={handleBarangayChange}
            required
            disabled={!selectedMunicipalityCode || isLoadingBarangays}
          >
            <option value="">
              {!selectedMunicipalityCode
                ? "Select City / Municipality first"
                : isLoadingBarangays
                  ? "Loading barangays..."
                  : "Select Barangay"}
            </option>
            {filteredBarangayOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (key === "zip_code") {
      return (
        <div key={key} className="col-12">
          <label htmlFor="zip_code" className="form-label">ZIP Code / Postal Code</label>
          <input
            id="zip_code"
            name="zip_code"
            type="text"
            className="form-control registration-input"
            value={form.zip_code || ""}
            onChange={handleChange}
            required
            maxLength={4}
            inputMode="numeric"
            pattern="[0-9]{4}"
          />
          <small className="registration-fixed-note">Auto-filled from selected barangay.</small>
        </div>
      );
    }

    if (key === "health_condition_group") {
      return (
        <div key={key} className="col-12">
          <label className="form-label mb-1">Health Condition</label>
          <div className="health-check-options">
            <label className={`health-check-option ${form.health_condition === "No" ? "is-active" : ""}`}>
              <input
                id="health_condition_none"
                name="health_condition"
                type="radio"
                value="No"
                checked={form.health_condition === "No"}
                onChange={handleChange}
                required
              />
              <span>None</span>
            </label>
            <label className={`health-check-option ${form.health_condition === "Yes" ? "is-active" : ""}`}>
              <input
                id="health_condition_yes"
                name="health_condition"
                type="radio"
                value="Yes"
                checked={form.health_condition === "Yes"}
                onChange={handleChange}
                required
              />
              <span>Yes</span>
            </label>
          </div>

          <div className="mt-2">
            <label htmlFor="health_condition_details" className="form-label mb-1">If Yes, please specify</label>
            <input
              id="health_condition_details"
              name="health_condition_details"
              type="text"
              className={`form-control registration-input ${form.health_condition === "Yes" ? "" : "registration-input-disabled"}`}
              value={form.health_condition_details || ""}
              onChange={handleChange}
              required={form.health_condition === "Yes"}
              disabled={form.health_condition !== "Yes"}
            />
          </div>
        </div>
      );
    }

    if (key === "category" || key === "payment_method") {
      return (
        <div key={key} className="col-12">
          <label htmlFor={key} className="form-label">{config.label}</label>
          <input
            id={key}
            name={key}
            type="text"
            className="form-control registration-input registration-input-fixed"
            value={form[key] || ""}
            readOnly
          />
          <small className="registration-fixed-note">Fixed for this event.</small>
        </div>
      );
    }

    if (config.type === "file") {
      return (
        <div key={key} className="col-12">
          <label htmlFor={key} className="form-label">{config.label}</label>
          <input
            id={key}
            name={key}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            className="form-control registration-input"
            onChange={handleFileChange}
            disabled={isProcessingProofFile || isSubmitting}
          />
          <small className="registration-upload-hint">
            Allowed: JPG, PNG, WEBP, PDF. Max {formatBytes(PAYMENT_MAX_FILE_BYTES)} after compression.
          </small>
          {proofFileMeta.name ? (
            <small className="registration-upload-meta">
              {proofFileMeta.wasCompressed
                ? `${proofFileMeta.name} (${formatBytes(proofFileMeta.originalSize)} -> ${formatBytes(proofFileMeta.finalSize)})`
                : `${proofFileMeta.name} (${formatBytes(proofFileMeta.finalSize)})`}
            </small>
          ) : null}
        </div>
      );
    }

    if (config.type === "select") {
      return (
        <div key={key} className="col-12">
          <label htmlFor={key} className="form-label">{config.label}</label>
          <select
            id={key}
            name={key}
            className="form-select registration-input"
            value={form[key] || ""}
            onChange={handleChange}
            required={Boolean(config.required)}
          >
            <option value="">Select</option>
            {config.options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      );
    }

    return (
      <div key={key} className="col-12">
        <label htmlFor={key} className="form-label">{config.label}</label>
        <input
          id={key}
          name={key}
          type={
            (key === "contact_no" || key === "emergency_contact_no") && isMobileViewport
              ? "number"
              : config.type
          }
          className="form-control registration-input"
          value={form[key] || ""}
          onChange={handleChange}
          required={Boolean(config.required)}
          inputMode={
            key === "contact_no" || key === "emergency_contact_no"
              ? "numeric"
              : undefined
          }
          pattern={
            key === "contact_no" || key === "emergency_contact_no" ? "[0-9]*" : undefined
          }
          min={key === "amount_to_be_paid" ? "0" : undefined}
          step={key === "amount_to_be_paid" ? "0.01" : undefined}
        />
      </div>
    );
  };

  return (
    <div
      ref={modalRef}
      className="modal fade registration-fillout-modal"
      id={modalId}
      tabIndex="-1"
      aria-labelledby="registrationFormLabel"
      aria-hidden="true"
    >
      <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable registration-fillout-dialog">
        <div className="modal-content registration-fillout-content border-0">
          <div className="modal-header registration-fillout-header border-0">
            <h2 className="modal-title h5 fw-bold text-uppercase" id="registrationFormLabel">Trail Run Registration</h2>
            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div className="modal-body registration-fillout-body">
            <div className={`registration-split ${isLastStep ? "is-payment-step" : ""}`}>
              <aside className="registration-left">
                <img
                  src="/assets/images/trail-run-logo.png"
                  alt="Trail Run Logo"
                  className="registration-banner"
                  loading="lazy"
                  decoding="async"
                />
                <div className="registration-privacy">
                  <h3>Principle of Accuracy</h3>
                  <p>
                    Your data is used only to organize and conduct The GAGAYAM Trail Run 2026 and is handled
                    under the Data Privacy Act of 2012.
                  </p>
                  <ul>
                    <li>Collected data includes your registration, emergency contact, and payment proof details.</li>
                    <li>Your information is accessed only by authorized LGU Sabangan event personnel.</li>
                    <li>Your data is not shared with third parties except when required by law.</li>
                    <li>Records are retained only as long as necessary for event operations and audit compliance.</li>
                  </ul>
                  <p>
                    By submitting this form, you acknowledge and consent to the collection and processing of your
                    personal data for official event management purposes.
                  </p>
                </div>
              </aside>

              <section className={`registration-right ${isLastStep ? "is-payment-step" : ""}`}>
                <div className="registration-step-header">
                  <span className="registration-step-badge">Step {stepIndex + 1} of {steps.length}</span>
                  <h3>{currentStep.title}</h3>
                  <p>
                    Fill out {currentStep.keys.length} fields, then {isLastStep ? "submit your registration." : "click Next."}
                  </p>
                </div>

                <form ref={formRef} onSubmit={handleSubmit} className="row g-2 registration-form-grid">
                  {currentStep.keys.map(renderField)}

                  {isLastStep ? (
                    <div className="col-12 pt-2">
                      <label className="registration-accept">
                        <input
                          type="checkbox"
                          checked={accepted}
                          onChange={(event) => setAccepted(event.target.checked)}
                        />
                        <span>I accept the Principle of Accuracy.</span>
                      </label>
                    </div>
                  ) : null}

                  {status.message ? (
                    <div className="col-12">
                      <div className={`alert ${status.type === "success" ? "alert-success" : "alert-danger"} mb-0`} role="alert">
                        {status.message}
                      </div>
                    </div>
                  ) : null}

                  <div className="col-12 d-flex justify-content-between align-items-center pt-2">
                    <button
                      type="button"
                      className="btn registration-close-btn"
                      onClick={handleBack}
                      disabled={stepIndex === 0 || isSubmitting || isProcessingProofFile || privacyConfirm.open}
                    >
                      Back
                    </button>

                    {!isLastStep ? (
                      <button
                        type="button"
                        className="btn registration-next-btn"
                        onClick={handleNext}
                        disabled={isSubmitting || isProcessingProofFile || privacyConfirm.open}
                      >
                        Next
                      </button>
                    ) : (
                      <button
                        type="submit"
                        className="btn registration-submit-btn"
                        disabled={!canSubmit || privacyConfirm.open}
                      >
                        {isSubmitting ? "Submitting..." : "Accept & Register"}
                      </button>
                    )}
                  </div>
                </form>
              </section>
            </div>
          </div>
        </div>
      </div>

      {privacyConfirm.open ? (
        <div className="registration-privacy-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="privacyConfirmTitle">
          <div className="registration-privacy-confirm-card">
            <h3 id="privacyConfirmTitle" className="registration-privacy-confirm-title">Confirm Principle of Accuracy</h3>
            <p className="registration-privacy-confirm-copy">
              You are about to submit your registration. By confirming, you declare that all information you provided is true,
              complete, and accurate, and this confirmation will be recorded in the registration database.
            </p>
            <div className="registration-privacy-confirm-actions">
              <button
                type="button"
                className="btn registration-privacy-cancel-btn"
                onClick={handlePrivacyCancel}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn registration-privacy-confirm-btn"
                onClick={handlePrivacyConfirm}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Confirm & Submit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .registration-fillout-modal .modal-dialog {
          width: min(1100px, 96vw);
          max-width: min(1100px, 96vw);
          margin: 1rem auto;
        }

        .registration-fillout-content {
          background: linear-gradient(160deg, #f6fdf8 0%, #ecf8f1 100%);
          border-radius: 1rem;
          box-shadow: 0 18px 42px rgba(3, 50, 32, 0.25);
          color: #0f2d1f;
          max-height: calc(100vh - 2rem);
          overflow: hidden;
        }

        .registration-fillout-header {
          padding: 1rem 1.2rem 0.35rem;
          color: #0f2d1f;
        }

        .registration-fillout-body {
          padding: 0.35rem 1rem 1.1rem;
          overflow-y: auto;
        }

        .registration-split {
          display: grid;
          grid-template-columns: minmax(280px, 1fr) minmax(340px, 1.2fr);
          gap: 1rem;
          align-items: start;
          min-width: 0;
        }

        .registration-left,
        .registration-right {
          background: #f1f3f3;
          border: 1px solid #d9e9df;
          border-radius: 0.9rem;
          padding: 0.95rem;
          min-width: 0;
        }

        .registration-banner {
          width: 100%;
          aspect-ratio: 4 / 3;
          border-radius: 0.75rem;
          border: 2px solid #d7eadd;
          object-fit: contain;
          background: #fff;
          padding: 0.8rem;
        }

        .registration-privacy {
          margin-top: 0.72rem;
          background: #fff7d6;
          border: 1px solid #f0d26a;
          border-radius: 0.75rem;
          padding: 0.66rem 0.78rem;
        }

        .registration-privacy h3 {
          margin: 0 0 0.34rem;
          font-size: 0.9rem;
          font-weight: 800;
          color: #896300;
        }

        .registration-privacy p {
          margin: 0;
          font-size: 0.82rem;
          line-height: 1.42;
          color: #5a4a07;
        }

        .registration-privacy ul {
          margin: 0.45rem 0;
          padding-left: 1.05rem;
          color: #5a4a07;
        }

        .registration-privacy li {
          margin: 0.22rem 0;
          font-size: 0.8rem;
          line-height: 1.35;
        }

        .registration-step-header {
          margin-bottom: 0.68rem;
        }

        .registration-step-badge {
          display: inline-block;
          background: #013220;
          color: #fff;
          font-size: 0.73rem;
          font-weight: 700;
          padding: 0.24rem 0.5rem;
          border-radius: 999px;
          margin-bottom: 0.35rem;
        }

        .registration-step-header h3 {
          margin: 0;
          font-size: 1.08rem;
          font-weight: 800;
          color: #0f2d1f;
        }

        .registration-step-header p {
          margin: 0.18rem 0 0;
          color: #1f553d;
          font-size: 0.84rem;
        }

        .registration-form-grid {
          background: #fff;
          border: 1px solid #d5e8dc;
          border-radius: 0.75rem;
          padding: 0.7rem;
          margin: 0;
          min-width: 0;
        }

        .registration-form-grid .form-label {
          font-size: 0.76rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #194833;
          margin-bottom: 0.28rem;
        }

        .registration-input {
          border-color: #c8ddcf;
          color: #0f2d1f;
          min-height: 43px;
        }

        .registration-input:focus {
          border-color: #43b97a;
          box-shadow: 0 0 0 0.25rem rgba(67, 185, 122, 0.2);
        }

        .registration-input-fixed {
          background: #eef5f0;
          font-weight: 700;
        }

        .registration-fixed-note {
          display: inline-block;
          margin-top: 0.2rem;
          color: #486b57;
          font-size: 0.74rem;
          font-weight: 600;
        }

        .registration-upload-hint,
        .registration-upload-meta {
          display: block;
          margin-top: 0.28rem;
          color: #486b57;
          font-size: 0.74rem;
          font-weight: 600;
          line-height: 1.34;
        }

        .registration-upload-meta {
          color: #184d35;
        }

        .health-check-options {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }

        .health-check-option {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          border: 1px solid #c8ddcf;
          border-radius: 0.55rem;
          padding: 0.42rem 0.6rem;
          background: #fff;
          color: #174c35;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .health-check-option input {
          accent-color: #43b97a;
        }

        .health-check-option.is-active {
          border-color: #43b97a;
          box-shadow: 0 0 0 2px rgba(67, 185, 122, 0.15);
          background: #f2fbf6;
        }

        .registration-input-disabled {
          background: #eef3ef;
          color: #5b6e61;
        }

        .registration-accept {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.84rem;
          font-weight: 600;
          color: #174c35;
        }

        .registration-accept input {
          width: 16px;
          height: 16px;
          accent-color: #43b97a;
        }

        .registration-qr-panel {
          background: #eef7f1;
          border: 1px solid #cde4d6;
          border-radius: 0.75rem;
          padding: 0.65rem;
          text-align: center;
          overflow: hidden;
          width: 100%;
          max-width: 280px;
          box-sizing: border-box;
          margin-left: auto;
          margin-right: auto;
        }

        .registration-qr-image {
          display: block;
          width: min(100%, 220px);
          max-width: 100%;
          max-height: 220px;
          object-fit: contain;
          box-sizing: border-box;
          border-radius: 0.6rem;
          border: 2px solid #d7eadd;
          margin: 0 auto 0.5rem;
        }

        .registration-qr-text {
          color: #174c35;
          font-size: 0.82rem;
          font-weight: 600;
        }

        .registration-close-btn,
        .registration-next-btn,
        .registration-submit-btn {
          min-width: 128px;
          font-weight: 800;
        }

        .registration-close-btn {
          border: 1px solid #9ab8a7;
          color: #174c35;
          background: transparent;
        }

        .registration-close-btn:hover {
          background: #eaf6ef;
          color: #0f2d1f;
        }

        .registration-next-btn,
        .registration-submit-btn {
          border: 1px solid #f08a24;
          background: linear-gradient(145deg, #f8a53b 0%, #f08a24 55%, #d87411 100%);
          color: #fff;
        }

        .registration-next-btn:hover,
        .registration-submit-btn:hover {
          background: linear-gradient(145deg, #f08a24 0%, #e67e16 52%, #cc6707 100%);
          color: #fff;
        }

        .registration-privacy-confirm-overlay {
          position: fixed;
          inset: 0;
          z-index: 2050;
          background: rgba(1, 14, 9, 0.62);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }

        .registration-privacy-confirm-card {
          width: min(470px, calc(100vw - 1.6rem));
          background: #f6fdf8;
          border: 1px solid #d5e8dc;
          border-radius: 0.95rem;
          padding: 1rem;
          box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);
        }

        .registration-privacy-confirm-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 800;
          color: #123b2a;
        }

        .registration-privacy-confirm-copy {
          margin: 0.5rem 0 0;
          font-size: 0.84rem;
          line-height: 1.42;
          color: #1f553d;
        }

        .registration-privacy-confirm-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.55rem;
          margin-top: 0.9rem;
        }

        .registration-privacy-cancel-btn {
          border: 1px solid #9ab8a7;
          color: #174c35;
          background: transparent;
          min-width: 105px;
          font-weight: 700;
        }

        .registration-privacy-cancel-btn:hover {
          background: #eaf6ef;
          color: #0f2d1f;
        }

        .registration-privacy-confirm-btn {
          border: 1px solid #f08a24;
          background: linear-gradient(145deg, #f8a53b 0%, #f08a24 55%, #d87411 100%);
          color: #fff;
          min-width: 145px;
          font-weight: 800;
        }

        .registration-privacy-confirm-btn:hover {
          background: linear-gradient(145deg, #f08a24 0%, #e67e16 52%, #cc6707 100%);
          color: #fff;
        }

        .registration-toast {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 2000;
          min-width: 260px;
          max-width: min(420px, calc(100vw - 32px));
          border-radius: 0.8rem;
          padding: 0.78rem 0.95rem;
          box-shadow: 0 16px 34px rgba(0, 0, 0, 0.25);
          border: 1px solid transparent;
          animation: registration-toast-in 180ms ease-out;
        }

        .registration-toast.is-success {
          background: #eaf8ef;
          border-color: #b6e4c8;
          color: #115c35;
        }

        .registration-toast.is-error {
          background: #fff1f1;
          border-color: #f0b9b9;
          color: #8f2424;
        }

        .registration-toast-title {
          margin: 0;
          font-size: 0.86rem;
          font-weight: 800;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        .registration-toast-message {
          margin: 0.2rem 0 0;
          font-size: 0.85rem;
          font-weight: 600;
          line-height: 1.35;
        }

        @keyframes registration-toast-in {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 991px) {
          .registration-split {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 767px) {
          .registration-qr-panel,
          .registration-right.is-payment-step .registration-qr-panel {
            width: 100%;
            max-width: 240px !important;
            padding: 0.5rem;
            margin-left: auto;
            margin-right: auto;
          }

          .registration-qr-image,
          .registration-right.is-payment-step .registration-qr-image {
            width: 100% !important;
            max-width: 190px !important;
            max-height: 190px !important;
            height: auto;
            margin-left: auto;
            margin-right: auto;
          }
        }

        @media (max-width: 575px) {
          .registration-fillout-modal .modal-dialog {
            width: min(95vw, 95vw);
            margin: 0.45rem auto;
            max-height: calc(100vh - 0.9rem);
            overflow-x: hidden;
          }

          .registration-fillout-content,
          .registration-fillout-body,
          .registration-split,
          .registration-right,
          .registration-form-grid {
            max-width: 100%;
            overflow-x: hidden;
          }

          .registration-form-grid > [class*="col-"] {
            min-width: 0;
          }

          .registration-fillout-body {
            padding: 0.28rem 0.62rem 0.85rem;
          }

          .registration-split.is-payment-step .registration-left {
            display: none;
          }

          .registration-split.is-payment-step {
            grid-template-columns: 1fr;
          }

          .registration-toast {
            right: 12px;
            left: 12px;
            bottom: 12px;
            max-width: unset;
            min-width: 0;
          }

          .registration-form-grid .registration-input,
          .registration-form-grid .form-select,
          .registration-form-grid .form-control {
            font-size: 16px;
          }

          .registration-qr-panel {
            width: 100%;
            padding: 0.45rem;
            max-width: 180px;
          }

          .registration-qr-image {
            width: 100%;
            max-width: 140px;
            height: auto;
            max-height: 140px;
          }

          .registration-right.is-payment-step .registration-step-header h3 {
            font-size: 1.12rem;
          }

          .registration-right.is-payment-step .registration-step-header p {
            font-size: 0.9rem;
          }

          .registration-right.is-payment-step .registration-form-grid {
            padding: 0.85rem;
            max-height: calc(100vh - 320px);
            overflow-y: auto;
          }

          .registration-right.is-payment-step .registration-qr-panel {
            width: 100%;
            padding: 0.45rem;
            max-width: 170px;
            margin-left: auto;
            margin-right: auto;
          }

          .registration-right.is-payment-step .registration-qr-image {
            width: 100%;
            max-width: 130px;
            height: auto;
            max-height: 130px;
          }

          .registration-right.is-payment-step .registration-qr-text {
            font-size: 0.9rem;
          }

          .registration-form-grid .col-12.d-flex.justify-content-between.align-items-center {
            flex-direction: column;
            gap: 0.5rem;
            align-items: stretch !important;
          }

          .registration-close-btn,
          .registration-next-btn,
          .registration-submit-btn {
            width: 100%;
            min-width: 0;
          }

          .registration-privacy-confirm-actions {
            flex-direction: column;
          }

          .registration-privacy-cancel-btn,
          .registration-privacy-confirm-btn {
            width: 100%;
          }
        }
      `}</style>

      {toast.show ? (
        <div
          className={`registration-toast ${toast.type === "success" ? "is-success" : "is-error"}`}
          role="status"
          aria-live="polite"
        >
          <p className="registration-toast-title">{toast.type === "success" ? "Submitted" : "Submission Failed"}</p>
          <p className="registration-toast-message">{toast.message}</p>
        </div>
      ) : null}
    </div>
  );
}
