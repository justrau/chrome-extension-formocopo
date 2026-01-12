'use strict';

// Track which form is selected
let selectedForm = null;

// Track cursor position for popover
let lastCursorPosition = { x: 0, y: 0 };

// Track mouse position
document.addEventListener('mousemove', (event) => {
  lastCursorPosition = { x: event.clientX, y: event.clientY };
});

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
  // Ignore keydowns in input elements and textareas (except for popover shortcut)
  const tagName = document.activeElement.tagName.toLowerCase();
  const inFormField = tagName === 'input' || tagName === 'textarea' || tagName === 'select';

  // Build the shortcut string based on pressed keys
  const shortcutParts = [];
  if (event.altKey) {
    shortcutParts.push('Alt');
  }
  if (event.ctrlKey) {
    shortcutParts.push('Ctrl');
  }
  if (event.shiftKey) {
    shortcutParts.push('Shift');
  }
  if (event.metaKey) {
    shortcutParts.push('Meta');
  }

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

  // Check both popover shortcut and form fill shortcuts
  chrome.storage.local.get(['popoverShortcut', 'formShortcuts'], (result) => {
    const popoverShortcut = result.popoverShortcut || '';
    const formShortcuts = result.formShortcuts || {};

    // Check if this is the popover shortcut
    if (popoverShortcut && shortcutKey === popoverShortcut) {
      event.preventDefault();
      showPresetPopover();
      return;
    }

    // If we're in a form field, don't check form fill shortcuts
    if (inFormField) {
      return;
    }

    // Check if this is a form fill shortcut
    const presetName = formShortcuts[shortcutKey];
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

    // Track which fields have been filled to avoid duplicates
    const filledFields = new Set();

    // Function to perform one pass of filling
    const fillPass = (passNumber) => {
      console.log(`\n=== Fill pass ${passNumber} ===`);
      let fieldsFilledThisPass = 0;

      // Get all form elements on the page
      const inputs = document.querySelectorAll('input, select, textarea');

      inputs.forEach(input => {
        // Skip buttons and submit inputs
        if (input.type === 'button' || input.type === 'submit' || input.type === 'reset') {
          return;
        }

        const fieldId = getUniqueFieldId(input);

        // Skip if we've already filled this field
        if (filledFields.has(fieldId)) {
          return;
        }

        const savedField = formData[fieldId];

        if (savedField) {
          console.log(`Found field by ID match: ${input.name || input.id || 'unnamed'}, type: ${input.tagName.toLowerCase()}, saved value:`, savedField.value);
          console.log(`Filling field by ID: ${input.name || input.id || 'unnamed'}, current value: "${input.value}", new value:`, savedField.value);

          // Set the field value based on its type
          if (input.type === 'checkbox' || input.type === 'radio') {
            // Only update if current state doesn't match desired state
            if (input.checked !== savedField.value) {
              // For radio buttons and checkboxes, try to click the label if available
              if (savedField.value && input.id) {
                const label = document.querySelector(`label[for="${input.id}"]`);
                if (label) {
                  label.click();
                  fieldsFilledThisPass++;
                  filledFields.add(fieldId);
                } else {
                  input.checked = savedField.value;
                  fieldsFilledThisPass++;
                  filledFields.add(fieldId);
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                }
              } else {
                // For unchecking, just set checked to false
                input.checked = false;
                filledFields.add(fieldId);
                if (savedField.value) {
                  fieldsFilledThisPass++;
                }
              }
            } else {
              // Already in correct state, just mark as filled
              filledFields.add(fieldId);
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
            fieldsFilledThisPass++;
            filledFields.add(fieldId);
            // Dispatch change event
            input.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            // Regular inputs and textareas
            input.value = savedField.value;
            fieldsFilledThisPass++;
            filledFields.add(fieldId);
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
                console.log(`Found field by name match: ${input.name}, element type: ${input.tagName.toLowerCase()}, field type: ${field.type}, saved value:`, field.value);
                console.log(`Filling field: ${input.name}, current value: "${input.value}", new value:`, field.value);

                // Handle field types
                if (input.type === 'checkbox' || input.type === 'radio') {
                  if (input.type === field.type) {
                    // Only update if current state doesn't match desired state
                    if (input.checked !== field.value) {
                      // Try to click the label if available
                      if (field.value && input.id) {
                        const label = document.querySelector(`label[for="${input.id}"]`);
                        if (label) {
                          label.click();
                          fieldsFilledThisPass++;
                          filledFields.add(fieldId);
                        } else {
                          input.checked = field.value;
                          fieldsFilledThisPass++;
                          filledFields.add(fieldId);
                          input.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                      } else {
                        // For unchecking, just set checked to false
                        input.checked = false;
                        filledFields.add(fieldId);
                        if (field.value) {
                          fieldsFilledThisPass++;
                        }
                      }
                    } else {
                      // Already in correct state, just mark as filled
                      filledFields.add(fieldId);
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
                    fieldsFilledThisPass++;
                    filledFields.add(fieldId);
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                } else {
                  input.value = field.value;
                  fieldsFilledThisPass++;
                  filledFields.add(fieldId);
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                }

                break; // Break after the first match
              }
            }
          }
        }
      });

      console.log(`Pass ${passNumber} filled ${fieldsFilledThisPass} fields`);
      return fieldsFilledThisPass;
    };

    // Perform multiple passes with delays to allow DOM updates
    const performPasses = async (maxPasses = 10) => {
      for (let i = 1; i <= maxPasses; i++) {
        const filled = fillPass(i);

        // If no fields were filled this pass, we're done
        if (filled === 0) {
          console.log(`No more fields to fill. Completed after ${i} passes.`);
          console.log(`Total fields filled: ${filledFields.size}`);
          break;
        }

        // If we've done the max passes, stop
        if (i === maxPasses) {
          console.log(`Reached maximum of ${maxPasses} passes. Total fields filled: ${filledFields.size}`);
          break;
        }

        // Wait a bit for the DOM to update (e.g., for conditional fields to appear)
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    };

    performPasses();
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

  // For radio buttons and checkboxes with the same name, include the value to differentiate them
  if ((element.type === 'radio' || element.type === 'checkbox') && element.value) {
    id += `value="${element.value}"`;
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

// Show preset popover at cursor position
function showPresetPopover() {
  // Remove any existing popover
  removePresetPopover();

  // Get all saved presets
  chrome.storage.local.get('formPresets', (result) => {
    const presets = result.formPresets || {};
    const presetNames = Object.keys(presets);

    if (presetNames.length === 0) {
      // Show a message if no presets
      showTemporaryMessage('No saved presets', lastCursorPosition.x, lastCursorPosition.y);
      return;
    }

    // Create the popover
    const popover = document.createElement('div');
    popover.id = 'formocopo-preset-popover';
    popover.style.cssText = `
      position: fixed;
      z-index: 999999;
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 8px 0;
      min-width: 200px;
      max-width: 300px;
      max-height: 400px;
      overflow-y: auto;
      font-family: Arial, sans-serif;
      font-size: 14px;
    `;

    // Sort presets by savedAt date (newest first)
    const sortedPresets = Object.entries(presets)
      .sort(([, a], [, b]) => new Date(b.savedAt) - new Date(a.savedAt));

    // Create list items for each preset
    sortedPresets.forEach(([presetName, preset], index) => {
      const item = document.createElement('div');
      item.className = 'formocopo-preset-item';
      const isLast = index === sortedPresets.length - 1;
      item.style.cssText = `
        padding: 10px 12px;
        cursor: pointer;
        ${!isLast ? 'border-bottom: 1px solid #f0f0f0;' : ''}
        transition: background-color 0.15s;
      `;

      // Format date
      const date = new Date(preset.savedAt);
      const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;

      item.innerHTML = `
        <div style="font-weight: 500; color: #333; margin-bottom: 3px;">${presetName}</div>
        <div style="font-size: 11px; color: #999;">${formattedDate}</div>
      `;

      // Hover effects
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#f5f5f5';
      });
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'transparent';
      });

      // Click handler
      item.addEventListener('click', () => {
        fillForm(presetName);
        removePresetPopover();
      });

      popover.appendChild(item);
    });

    // Position the popover near the cursor
    document.body.appendChild(popover);

    // Calculate position to keep popover on screen
    const popoverRect = popover.getBoundingClientRect();
    let left = lastCursorPosition.x;
    let top = lastCursorPosition.y + 10; // 10px below cursor

    // Adjust if popover would go off right edge
    if (left + popoverRect.width > window.innerWidth) {
      left = window.innerWidth - popoverRect.width - 10;
    }

    // Adjust if popover would go off bottom edge
    if (top + popoverRect.height > window.innerHeight) {
      top = lastCursorPosition.y - popoverRect.height - 10; // Show above cursor
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    // Close popover when clicking outside
    setTimeout(() => {
      document.addEventListener('click', handlePopoverOutsideClick);
      document.addEventListener('keydown', handlePopoverEscape);
    }, 0);
  });
}

// Remove preset popover
function removePresetPopover() {
  const existingPopover = document.getElementById('formocopo-preset-popover');
  if (existingPopover) {
    existingPopover.remove();
    document.removeEventListener('click', handlePopoverOutsideClick);
    document.removeEventListener('keydown', handlePopoverEscape);
  }
}

// Handle clicks outside popover
function handlePopoverOutsideClick(event) {
  const popover = document.getElementById('formocopo-preset-popover');
  if (popover && !popover.contains(event.target)) {
    removePresetPopover();
  }
}

// Handle escape key to close popover
function handlePopoverEscape(event) {
  if (event.key === 'Escape') {
    removePresetPopover();
  }
}

// Show temporary message
function showTemporaryMessage(message, x, y) {
  const messageElement = document.createElement('div');
  messageElement.style.cssText = `
    position: fixed;
    z-index: 999999;
    background: #333;
    color: white;
    padding: 10px 15px;
    border-radius: 6px;
    font-family: Arial, sans-serif;
    font-size: 13px;
    left: ${x}px;
    top: ${y + 10}px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  `;
  messageElement.textContent = message;
  document.body.appendChild(messageElement);

  // Remove after 2 seconds
  setTimeout(() => {
    messageElement.remove();
  }, 2000);
}