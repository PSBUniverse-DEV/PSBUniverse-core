"use client";

import { useMemo, useState } from "react";
import Form from "react-bootstrap/Form";
import { Dropdown as BootstrapDropdown } from "react-bootstrap";

function MultiSelectDropdown({
  options = [],
  selectedValues = [],
  onChange,
  placeholder = "Select...",
  buttonVariant = "secondary",
  buttonSize = "sm",
  menuStyle,
  className = "",
  ...props
}) {
  const [show, setShow] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedValues || []), [selectedValues]);
  const selectedLabels = useMemo(() => {
    const labels = options
      .filter((option) => selectedSet.has(option.value))
      .map((option) => option.label);
    return labels.length > 0 ? labels.join(", ") : "";
  }, [options, selectedSet]);

  const selectedCount = selectedValues?.length || 0;
  const selectedLabel = selectedCount > 0 ? `${selectedCount} selected` : placeholder;

  const handleToggleValue = (value) => {
    const nextValues = selectedSet.has(value)
      ? selectedValues.filter((item) => item !== value)
      : [...selectedValues, value];
    onChange?.(nextValues);
  };

  return (
    <BootstrapDropdown
      show={show}
      onToggle={(nextShow) => setShow(nextShow)}
      className={className}
      {...props}
    >
      <BootstrapDropdown.Toggle variant={buttonVariant} size={buttonSize}>
        {selectedLabel}
      </BootstrapDropdown.Toggle>
      <BootstrapDropdown.Menu renderOnMount style={{ minWidth: 240, padding: 8, ...menuStyle }}>
        {options.map((option) => (
          <div key={option.value} style={{ padding: "4px 0" }}>
            <Form.Check
              type="checkbox"
              id={`psb-multiselect-${String(option.value)}`}
              checked={selectedSet.has(option.value)}
              onChange={() => handleToggleValue(option.value)}
              label={option.label}
              style={{ margin: 0 }}
            />
          </div>
        ))}
      </BootstrapDropdown.Menu>
    </BootstrapDropdown>
  );
}

export default MultiSelectDropdown;
