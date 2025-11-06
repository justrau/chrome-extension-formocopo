'use strict';

// Track which form is selected
let selectedForm = null;

// Listen for right-clicks to track which form is selected
document.addEventListener('contextmenu', (event) => {
  console.log('contextmenu', event, event.target, event.target.closest('form'));
  // Find the closest form to the clicked element
  const form = event.target.closest('form');
  if (form) {
    selectedForm = form;
  } else {
    // If no form found, the right-click wasn't on a form
    selectedForm = null;
  }
});

// Listen for keyboard shortcuts
document.addEventListener('keydown', handleKeyboardShortcut);

// Handler for keyboard shortcuts
function handleKeyboardShortcut(event) {
  // Ignore keydowns in input elements and textareas
  const tagName = document.activeElement.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return;
  }

  // Build the shortcut string based on pressed keys
  const shortcutParts = [];
  if (event.altKey) shortcutParts.push('Alt');
  if (event.ctrlKey) shortcutParts.push('Ctrl');
  if (event.shiftKey) shortcutParts.push('Shift');
  if (event.metaKey) shortcutParts.push('Meta');

  // Get the key itself
  let key = event.key;

  // Map special keys to their common names
  const keyMap = {
    ' ': 'Space',
    'ArrowUp': 'ArrowUp',
    'ArrowDown': 'ArrowDown',
    'ArrowLeft': 'ArrowLeft',
    'ArrowRight': 'ArrowRight',
    'Enter': 'Enter',
    'Tab': 'Tab'
  };

  // For F1-F12 keys
  if (key.startsWith('F') && !isNaN(parseInt(key.substring(1)))) {
    // F1-F12 keys are fine as they are
  }
  // For letter keys, just take the uppercase letter
  else if (key.length === 1 && /[a-zA-Z]/.test(key)) {
    key = key.toUpperCase();
  }
  // For special keys, use the mapped name
  else if (keyMap[key]) {
    key = keyMap[key];
  }
  // For other keys, we don't include them in shortcuts
  else {
    return;
  }

  shortcutParts.push(key);

  // Only process if there's at least one modifier
  if (shortcutParts.length <= 1) {
    return;
  }

  // Construct the shortcut string
  const shortcutKey = shortcutParts.join('+');

  // Look up if this shortcut is registered
  chrome.storage.local.get("formShortcuts", (result) => {
    const shortcuts = result.formShortcuts || {};
    const presetName = shortcuts[shortcutKey];

    if (presetName) {
      // Prevent default browser behavior for this shortcut
      event.preventDefault();

      // Fill the form with the associated preset
      fillForm(presetName);
    }
  });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "saveForm") {
    saveForm();
  } else if (message.action === "fillForm") {
    fillForm(message.presetName);
  }
});

// Function to save form data
function saveForm() {
  if (!selectedForm) {
    alert("No form selected. Right-click on a form element first.");
    return;
  }

  // Collect all form fields
  const formData = {};
  const inputs = selectedForm.querySelectorAll('input, select, textarea');

  inputs.forEach(input => {
    // Skip buttons and submit inputs
    if (input.type === 'button' || input.type === 'submit' || input.type === 'reset') {
      return;
    }

    if (input.type === 'checkbox' || input.type === 'radio') {
      // For checkboxes and radios, save their checked state
      formData[getUniqueFieldId(input)] = {
        type: input.type,
        value: input.checked,
        name: input.name
      };
    } else if (input.tagName.toLowerCase() === 'select') {
      // For select elements, save the selected option(s)
      if (input.multiple) {
        // Multiple select
        const selectedValues = Array.from(input.selectedOptions).map(option => option.value);
        formData[getUniqueFieldId(input)] = {
          type: 'select-multiple',
          value: selectedValues,
          name: input.name
        };
      } else {
        // Single select
        formData[getUniqueFieldId(input)] = {
          type: 'select',
          value: input.value,
          name: input.name
        };
      }
    } else {
      // For regular inputs and textareas
      formData[getUniqueFieldId(input)] = {
        type: input.type,
        value: input.value,
        name: input.name
      };
    }
  });

  // Print raw form data to console
  console.log('Raw form data being saved:', formData);

  // Generate a suggested preset name
  const suggestedName = generatePresetName(selectedForm);

  // Prompt user for preset name
  const presetName = prompt("Enter a name for this form preset:", suggestedName);

  if (!presetName) {
    // User cancelled the prompt
    return;
  }

  // Get existing presets, then save the new one
  chrome.storage.local.get("formPresets", (result) => {
    const presets = result.formPresets || {};

    // Add the new preset
    presets[presetName] = {
      url: window.location.href,
      formData: formData,
      savedAt: new Date().toISOString()
    };

    // Save back to storage
    chrome.storage.local.set({ formPresets: presets }, () => {
      // Notify that preset was saved to update menus
      chrome.runtime.sendMessage({ action: "presetSaved" });
      // alert(`Form preset "${presetName}" saved successfully!`);
    });
  });
}

// Function to fill a form with saved data
function fillForm(presetName) {
  chrome.storage.local.get("formPresets", (result) => {
    const presets = result.formPresets || {};

    if (!presets[presetName]) {
      alert(`Preset "${presetName}" not found.`);
      return;
    }

    const preset = presets[presetName];
    const formData = preset.formData;

    // Print raw form data to console
    console.log('Raw form data being pasted:', formData);

    // Try to fill any form on the page that has matching fields
    let fieldsFound = 0;
    let fieldsFilled = 0;

    // // Check if we're on the same page where the form was saved
    // if (preset.url !== window.location.href) {
    //   if (!confirm(`This preset was saved on ${preset.url}. Do you still want to try to fill the current form?`)) {
    //     return;
    //   }
    // }

    // Get all form elements on the page
    const inputs = document.querySelectorAll('input, select, textarea');

    inputs.forEach(input => {
      // Skip buttons and submit inputs
      if (input.type === 'button' || input.type === 'submit' || input.type === 'reset') {
        return;
      }

      const fieldId = getUniqueFieldId(input);
      const savedField = formData[fieldId];

      if (savedField) {
        fieldsFound++;
        console.log(`Found field by ID match: ${input.name || input.id || 'unnamed'}, type: ${input.tagName.toLowerCase()}, saved value:`, savedField.value);
        console.log(`Filling field by ID: ${input.name || input.id || 'unnamed'}, current value: "${input.value}", new value:`, savedField.value);

        // Set the field value based on its type
        if (input.type === 'checkbox' || input.type === 'radio') {
          input.checked = savedField.value;
          if (input.checked) {
            fieldsFilled++;
            // Dispatch change event
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else if (input.tagName.toLowerCase() === 'select') {
          if (input.multiple && Array.isArray(savedField.value)) {
            // Reset all options first
            Array.from(input.options).forEach(option => {
              option.selected = savedField.value.includes(option.value);
            });
          } else {
            // Try to set the value, and verify it was set correctly
            input.value = savedField.value;
            // If the value didn't match exactly, try to find by option text or value
            if (input.value !== savedField.value) {
              // Try to find option by value
              const option = Array.from(input.options).find(opt => opt.value === savedField.value);
              if (option) {
                option.selected = true;
                input.value = savedField.value;
              }
            }
          }
          fieldsFilled++;
          // Dispatch change event
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          // Regular inputs and textareas
          input.value = savedField.value;
          fieldsFilled++;
          // Dispatch input and change events
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        // Try to match by name if present
        if (input.name) {
          // Look through all saved fields to find one with matching name
          for (const [key, field] of Object.entries(formData)) {
            if (field.name === input.name) {
              fieldsFound++;
              console.log(`Found field by name match: ${input.name}, element type: ${input.tagName.toLowerCase()}, field type: ${field.type}, saved value:`, field.value);
              console.log(`Filling field: ${input.name}, current value: "${input.value}", new value:`, field.value);

              // Handle field types
              if (input.type === 'checkbox' || input.type === 'radio') {
                if (input.type === field.type) {
                  input.checked = field.value;
                  if (input.checked) {
                    fieldsFilled++;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              } else if (input.tagName.toLowerCase() === 'select') {
                if (field.type.startsWith('select') || field.type === 'select-one') {
                  if (input.multiple && Array.isArray(field.value)) {
                    Array.from(input.options).forEach(option => {
                      option.selected = field.value.includes(option.value);
                    });
                  } else {
                    // Try to set the value, and verify it was set correctly
                    input.value = field.value;
                    // If the value didn't match exactly, try to find by option value
                    if (input.value !== field.value) {
                      const option = Array.from(input.options).find(opt => opt.value === field.value);
                      if (option) {
                        option.selected = true;
                        input.value = field.value;
                      }
                    }
                  }
                  fieldsFilled++;
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                }
              } else {
                input.value = field.value;
                fieldsFilled++;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }

              break; // Break after the first match
            }
          }
        } else {
          console.log(`Field ${input.id || 'unnamed'} skipped - no name attribute and no ID match`);
        }
      }
    });

    // alert(`Form filled with preset "${presetName}"! Filled ${fieldsFilled} of ${fieldsFound} fields found.`);
  });
}

// Helper function to generate a unique ID for form fields
function getUniqueFieldId(element) {
  // Try to create a fairly unique ID based on attributes and position
  let id = '';

  // Use the name if available
  if (element.name) {
    id += `name="${element.name}"`;
  }

  // Use the id if available
  if (element.id) {
    id += `id="${element.id}"`;
  }

  // Use the label if available
  const label = document.querySelector(`label[for="${element.id}"]`);
  if (label && label.textContent) {
    id += `label="${label.textContent.trim()}"`;
  }

  // Add type info - normalize select elements
  let typeToUse = element.type;
  if (element.tagName.toLowerCase() === 'select') {
    // For select elements, normalize the type since element.type can be undefined or inconsistent
    typeToUse = element.multiple ? 'select-multiple' : 'select';
  } else if (!typeToUse) {
    // For other elements without a type, use tagName
    typeToUse = element.tagName.toLowerCase();
  }
  id += `type="${typeToUse}"`;

  // If still no unique identifiers, use position in form
  if (!element.name && !element.id && !label) {
    const form = element.closest('form');
    if (form) {
      const fields = Array.from(form.querySelectorAll('input, select, textarea'));
      const index = fields.indexOf(element);
      id += `index=${index}`;
    }
  }

  return id;
}

// Helper function to generate intelligent preset names
function generatePresetName(form) {
  // Check for headings inside the form
  for (let i = 1; i <= 7; i++) {
    const headings = form.querySelectorAll(`h${i}`);
    if (headings.length > 0) {
      const headingText = headings[0].textContent.trim();
      if (headingText) {
        return headingText;
      }
    }
  }

  // Check for headings in the same parent as the form
  if (form.parentElement) {
    for (let i = 1; i <= 7; i++) {
      const headings = form.parentElement.querySelectorAll(`h${i}`);
      if (headings.length > 0) {
        // Filter out headings that are inside other forms to avoid confusion
        const relevantHeadings = Array.from(headings).filter(heading => {
          const closestForm = heading.closest('form');
          return !closestForm || closestForm === form;
        });

        if (relevantHeadings.length > 0) {
          const headingText = relevantHeadings[0].textContent.trim();
          if (headingText) {
            return headingText;
          }
        }
      }
    }
  }

  // Fallback to window title
  const title = document.title.trim();
  return title || `Preset ${new Date().toLocaleString()}`;
}