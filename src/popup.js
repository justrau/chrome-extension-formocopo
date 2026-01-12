'use strict';

// Load presets when popup opens
document.addEventListener('DOMContentLoaded', () => {
  loadPresets();
  setupTabs();
  loadShortcuts();
  setupShortcutListeners();
});

// Setup tabs functionality
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and contents
      document
        .querySelectorAll('.tab')
        .forEach((t) => t.classList.remove('active'));
      document
        .querySelectorAll('.tab-content')
        .forEach((c) => c.classList.remove('active'));

      // Add active class to clicked tab
      tab.classList.add('active');

      // Show corresponding content
      const tabId = tab.getAttribute('data-tab');
      document.getElementById(`${tabId}-tab`).classList.add('active');
    });
  });
}

// Function to load presets
function loadPresets() {
  const presetListElement = document.getElementById('presetList');

  // Clear current list
  presetListElement.innerHTML = '';

  // Get all saved presets and shortcuts
  chrome.storage.local.get(['formPresets', 'formShortcuts'], (result) => {
    const presets = result.formPresets || {};
    const shortcuts = result.formShortcuts || {};

    // Create a reverse mapping of shortcuts to presets
    const presetShortcuts = {};
    Object.entries(shortcuts).forEach(([shortcutKey, presetName]) => {
      presetShortcuts[presetName] = shortcutKey;
    });

    if (Object.keys(presets).length === 0) {
      // No presets found
      presetListElement.innerHTML = `
        <div class="no-presets">
          No form presets saved yet.<br>
          Right-click on a form to save one.
        </div>
      `;
      return;
    }

    // Sort presets by savedAt date (newest first)
    const sortedPresets = Object.entries(presets).sort(
      ([, a], [, b]) => new Date(b.savedAt) - new Date(a.savedAt)
    );

    // Create list items for each preset
    sortedPresets.forEach(([presetName, preset]) => {
      const presetItem = document.createElement('div');
      presetItem.className = 'preset-item';
      presetItem.dataset.preset = presetName;

      // Format date
      const date = new Date(preset.savedAt);
      const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString(
        [],
        { hour: '2-digit', minute: '2-digit' }
      )}`;

      // Get shortcut for this preset
      const shortcutKey = presetShortcuts[presetName] || '';

      // Determine if this preset has a shortcut
      const shortcutHtml = shortcutKey
        ? `<span class="shortcut-key" data-preset="${presetName}">${shortcutKey}</span>`
        : `<span class="shortcut-key empty" data-preset="${presetName}">Set shortcut</span>`;

      // Create HTML for the preset item
      presetItem.innerHTML = `
        <div class="preset-info">
          <div class="preset-name" title="${presetName}">${presetName}</div>
          <div class="preset-date">${formattedDate}</div>
          ${shortcutHtml}
        </div>
        <div class="action-buttons">
          <button class="fill" data-preset="${presetName}">Fill</button>
          <button class="edit" data-preset="${presetName}">Edit</button>
          <button class="delete" data-preset="${presetName}">Delete</button>
        </div>
      `;

      presetListElement.appendChild(presetItem);
    });

    // Add event listeners for the buttons and shortcut elements
    addButtonEventListeners();
    addShortcutEventListeners();
  });
}

// Add event listeners to fill, edit, and delete buttons
function addButtonEventListeners() {
  // Fill button event listeners
  document.querySelectorAll('button.fill').forEach((button) => {
    button.addEventListener('click', async () => {
      const presetName = button.getAttribute('data-preset');

      // Get active tab
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs.length > 0) {
        // Send message to content script to fill the form
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'fillForm',
          presetName: presetName,
        });

        // Close the popup
        window.close();
      }
    });
  });

  // Edit button event listeners
  document.querySelectorAll('button.edit').forEach((button) => {
    button.addEventListener('click', () => {
      const presetName = button.getAttribute('data-preset');
      showEditView(presetName);
    });
  });

  // Delete button event listeners
  document.querySelectorAll('button.delete').forEach((button) => {
    button.addEventListener('click', () => {
      const presetName = button.getAttribute('data-preset');

      if (
        confirm(`Are you sure you want to delete the preset "${presetName}"?`)
      ) {
        // Get all presets, remove the selected one, and save back
        chrome.storage.local.get(['formPresets', 'formShortcuts'], (result) => {
          const presets = result.formPresets || {};
          const shortcuts = result.formShortcuts || {};

          if (presets[presetName]) {
            // Delete the preset
            delete presets[presetName];

            // Also delete any shortcut associated with this preset
            Object.keys(shortcuts).forEach((key) => {
              if (shortcuts[key] === presetName) {
                delete shortcuts[key];
              }
            });

            // Save back to storage
            chrome.storage.local.set(
              {
                formPresets: presets,
                formShortcuts: shortcuts,
              },
              () => {
                // Update context menus
                chrome.runtime.sendMessage({ action: 'presetSaved' });

                // Reload the list
                loadPresets();
              }
            );
          }
        });
      }
    });
  });
}

// Function to load shortcuts
function loadShortcuts() {
  const shortcutsListElement = document.getElementById('shortcutsList');

  // Clear current list
  shortcutsListElement.innerHTML = '';

  // Get saved shortcuts
  chrome.storage.local.get('formShortcuts', (result) => {
    const shortcuts = result.formShortcuts || {};

    if (Object.keys(shortcuts).length === 0) {
      shortcutsListElement.innerHTML = `
        <div class="no-presets">
          No shortcuts set yet.<br>
          Add a shortcut below.
        </div>
      `;
      return;
    }

    // Create list items for each shortcut
    Object.entries(shortcuts).forEach(([shortcutKey, presetName]) => {
      const shortcutItem = document.createElement('div');
      shortcutItem.className = 'shortcut-item';

      shortcutItem.innerHTML = `
        <div>
          <span class="shortcut-key">${shortcutKey}</span>
          <span>${presetName}</span>
        </div>
        <button class="delete" data-shortcut="${shortcutKey}">Remove</button>
      `;

      shortcutsListElement.appendChild(shortcutItem);
    });

    // Add event listeners for delete buttons
    document
      .querySelectorAll('#shortcutsList button.delete')
      .forEach((button) => {
        button.addEventListener('click', () => {
          const shortcutKey = button.getAttribute('data-shortcut');

          if (
            confirm(
              `Are you sure you want to remove the shortcut "${shortcutKey}"?`
            )
          ) {
            // Get all shortcuts, remove the selected one, and save back
            chrome.storage.local.get('formShortcuts', (result) => {
              const shortcuts = result.formShortcuts || {};

              if (shortcuts[shortcutKey]) {
                delete shortcuts[shortcutKey];

                // Save back to storage
                chrome.storage.local.set({ formShortcuts: shortcuts }, () => {
                  // Reload the shortcuts list
                  loadShortcuts();
                });
              }
            });
          }
        });
      });
  });
}

// Update the preset dropdown in the shortcuts tab
function updateShortcutPresetDropdown() {
  const presetDropdown = document.getElementById('newShortcutPreset');

  // Clear existing options except the first one
  while (presetDropdown.options.length > 1) {
    presetDropdown.remove(1);
  }

  // Get all presets
  chrome.storage.local.get('formPresets', (result) => {
    const presets = result.formPresets || {};

    // Sort presets by savedAt date (newest first)
    const sortedPresets = Object.entries(presets).sort(
      ([, a], [, b]) => new Date(b.savedAt) - new Date(a.savedAt)
    );

    // Add options for each preset
    sortedPresets.forEach(([presetName, preset]) => {
      const option = document.createElement('option');
      option.value = presetName;
      option.textContent = presetName;
      presetDropdown.appendChild(option);
    });
  });
}

// Setup listeners for shortcut management
function setupShortcutListeners() {
  const addShortcutButton = document.getElementById('addShortcut');
  const shortcutKeyInput = document.getElementById('newShortcutKey');
  const shortcutPresetSelect = document.getElementById('newShortcutPreset');

  // Handle key detection in shortcut input
  shortcutKeyInput.addEventListener('keydown', (event) => {
    // Prevent default to avoid typing in the input
    event.preventDefault();

    // Skip if it's just a modifier key by itself
    if (
      event.key === 'Control' ||
      event.key === 'Alt' ||
      event.key === 'Shift' ||
      event.key === 'Meta'
    ) {
      return;
    }

    // Build the shortcut string
    const shortcutParts = [];
    if (event.ctrlKey) shortcutParts.push('Ctrl');
    if (event.altKey) shortcutParts.push('Alt');
    if (event.shiftKey) shortcutParts.push('Shift');
    if (event.metaKey) shortcutParts.push('Meta');

    // Need at least one modifier
    if (shortcutParts.length === 0) {
      return;
    }

    // Get the key itself
    let key = event.key;

    // Map special keys to their common names
    const keyMap = {
      ' ': 'Space',
      ArrowUp: 'ArrowUp',
      ArrowDown: 'ArrowDown',
      ArrowLeft: 'ArrowLeft',
      ArrowRight: 'ArrowRight',
      Enter: 'Enter',
      Tab: 'Tab',
      Escape: 'Esc',
      Delete: 'Delete',
      Backspace: 'Backspace',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
    };

    // For F1-F12 keys
    if (key.startsWith('F') && !isNaN(parseInt(key.substring(1)))) {
      // F1-F12 keys are fine as they are
    }
    // For letter keys, use uppercase
    else if (key.length === 1 && /[a-zA-Z]/.test(key)) {
      key = key.toUpperCase();
    }
    // For number keys, just use the number
    else if (key.length === 1 && /[0-9]/.test(key)) {
      key = key;
    }
    // For special keys, use the mapped name
    else if (keyMap[key]) {
      key = keyMap[key];
    }
    // For other keys, use a generic label
    else {
      key = 'Key';
    }

    shortcutParts.push(key);

    // Set the input value
    shortcutKeyInput.value = shortcutParts.join('+');
  });

  // Clear the input on focus
  shortcutKeyInput.addEventListener('focus', () => {
    shortcutKeyInput.value = '';
    shortcutKeyInput.placeholder = 'Press keys...';
  });

  // Restore placeholder on blur
  shortcutKeyInput.addEventListener('blur', () => {
    if (!shortcutKeyInput.value) {
      shortcutKeyInput.placeholder = 'e.g., Alt+F';
    }
  });

  addShortcutButton.addEventListener('click', () => {
    const shortcutKey = shortcutKeyInput.value.trim();
    const presetName = shortcutPresetSelect.value;

    // Validate inputs
    if (!shortcutKey) {
      alert('Please enter a shortcut key combination');
      return;
    }

    if (!presetName) {
      alert('Please select a preset');
      return;
    }

    // No need for manual format validation anymore

    // Get existing shortcuts
    chrome.storage.local.get('formShortcuts', (result) => {
      const shortcuts = result.formShortcuts || {};

      // Check if shortcut already exists
      if (
        shortcuts[shortcutKey] &&
        !confirm(
          `Shortcut "${shortcutKey}" is already assigned to "${shortcuts[shortcutKey]}". Do you want to overwrite it?`
        )
      ) {
        return;
      }

      // Save the new shortcut
      shortcuts[shortcutKey] = presetName;
      chrome.storage.local.set({ formShortcuts: shortcuts }, () => {
        // Clear inputs
        shortcutKeyInput.value = '';
        shortcutKeyInput.placeholder = 'e.g., Alt+F';
        shortcutPresetSelect.selectedIndex = 0;

        // Reload shortcuts list
        loadShortcuts();
      });
    });
  });
}

// Add event listeners for shortcut elements
function addShortcutEventListeners() {
  // Shortcut key click listeners
  document.querySelectorAll('.shortcut-key').forEach((element) => {
    element.addEventListener('click', (event) => {
      const presetName = element.getAttribute('data-preset');
      const presetItem = element.closest('.preset-item');

      // Replace the shortcut element with an input field
      const inputField = document.createElement('input');
      inputField.type = 'text';
      inputField.className = 'shortcut-input';
      inputField.placeholder = 'Press keys...';
      inputField.readOnly = true;
      inputField.dataset.preset = presetName;

      // Remember the original shortcut in case we need to restore it
      inputField.dataset.originalShortcut = element.classList.contains('empty')
        ? ''
        : element.textContent;

      // Replace the element
      element.parentNode.replaceChild(inputField, element);

      // Focus the input field
      inputField.focus();

      // Add a small hint below
      const hintElement = document.createElement('div');
      hintElement.className = 'shortcut-hint';
      hintElement.textContent =
        'Press modifier keys (Ctrl, Alt, Shift) + a key, or Esc to cancel';

      // Insert the hint after the input
      inputField.insertAdjacentElement('afterend', hintElement);

      // Add keydown event listener to the input field
      inputField.addEventListener('keydown', handleShortcutKeydown);

      // Add blur event listener to save or cancel
      inputField.addEventListener('blur', () => {
        setTimeout(() => {
          // Use setTimeout to allow click events to process first
          finishShortcutEditing(presetItem, inputField, hintElement);
        }, 100);
      });
    });
  });
}

// Handle keydown events for shortcut input fields
function handleShortcutKeydown(event) {
  // Special handling for escape key to cancel
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    const inputField = event.target;
    const presetItem = inputField.closest('.preset-item');
    const hintElement = inputField.nextElementSibling;

    // Restore original shortcut
    finishShortcutEditing(presetItem, inputField, hintElement, true);
    return;
  }

  // Prevent default to avoid typing in the input
  event.preventDefault();

  // Skip if it's just a modifier key by itself
  if (
    event.key === 'Control' ||
    event.key === 'Alt' ||
    event.key === 'Shift' ||
    event.key === 'Meta'
  ) {
    return;
  }

  // Build the shortcut string
  const shortcutParts = [];
  if (event.ctrlKey) shortcutParts.push('Ctrl');
  if (event.altKey) shortcutParts.push('Alt');
  if (event.shiftKey) shortcutParts.push('Shift');
  if (event.metaKey) shortcutParts.push('Meta');

  // Need at least one modifier
  if (shortcutParts.length === 0) {
    return;
  }

  // Get the key itself
  let key = event.key;

  // Map special keys to their common names
  const keyMap = {
    ' ': 'Space',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    Enter: 'Enter',
    Tab: 'Tab',
    Escape: 'Esc',
    Delete: 'Delete',
    Backspace: 'Backspace',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
  };

  // For F1-F12 keys
  if (key.startsWith('F') && !isNaN(parseInt(key.substring(1)))) {
    // F1-F12 keys are fine as they are
  }
  // For letter keys, use uppercase
  else if (key.length === 1 && /[a-zA-Z]/.test(key)) {
    key = key.toUpperCase();
  }
  // For number keys, just use the number
  else if (key.length === 1 && /[0-9]/.test(key)) {
    key = key;
  }
  // For special keys, use the mapped name
  else if (keyMap[key]) {
    key = keyMap[key];
  }
  // For other keys, use a generic label
  else {
    key = 'Key';
  }

  shortcutParts.push(key);

  // Set the input value
  event.target.value = shortcutParts.join('+');

  // Save the shortcut immediately after setting
  const inputField = event.target;
  const presetItem = inputField.closest('.preset-item');
  const hintElement = inputField.nextElementSibling;

  // Wait a short time to show the shortcut, then save it
  setTimeout(() => {
    finishShortcutEditing(presetItem, inputField, hintElement);
  }, 500);
}

// Finish shortcut editing and save or cancel
function finishShortcutEditing(
  presetItem,
  inputField,
  hintElement,
  cancel = false
) {
  if (!presetItem || !inputField) return;

  const presetName = inputField.dataset.preset;
  const shortcutKey = cancel
    ? inputField.dataset.originalShortcut
    : inputField.value;

  // Remove hint element if it exists
  if (hintElement) {
    hintElement.remove();
  }

  // Create the new shortcut element
  const shortcutElement = document.createElement('span');
  shortcutElement.dataset.preset = presetName;

  if (shortcutKey) {
    shortcutElement.className = 'shortcut-key';
    shortcutElement.textContent = shortcutKey;

    // Save the new shortcut value if not canceling
    if (!cancel) {
      saveShortcut(shortcutKey, presetName);
    }
  } else {
    shortcutElement.className = 'shortcut-key empty';
    shortcutElement.textContent = 'Set shortcut';

    // If the original had a shortcut but now it's empty, remove it
    if (!cancel && inputField.dataset.originalShortcut) {
      removeShortcut(presetName);
    }
  }

  // Replace the input field with the shortcut element
  if (inputField.parentNode) {
    inputField.parentNode.replaceChild(shortcutElement, inputField);
  }

  // Re-add event listener to the new element
  shortcutElement.addEventListener('click', (event) => {
    const preset = event.target.getAttribute('data-preset');
    const item = event.target.closest('.preset-item');

    // Simulate a click on the shortcut to edit it
    event.target.click();
  });
}

// Save a shortcut in storage
function saveShortcut(shortcutKey, presetName) {
  chrome.storage.local.get('formShortcuts', (result) => {
    const shortcuts = result.formShortcuts || {};

    // First, remove any existing shortcut for this preset
    Object.keys(shortcuts).forEach((key) => {
      if (shortcuts[key] === presetName) {
        delete shortcuts[key];
      }
    });

    // Also remove any existing use of this shortcut
    if (shortcuts[shortcutKey]) {
      delete shortcuts[shortcutKey];
    }

    // Add the new shortcut
    shortcuts[shortcutKey] = presetName;

    // Save to storage
    chrome.storage.local.set({ formShortcuts: shortcuts }, () => {
      // No need to reload since we manually updated the UI
    });
  });
}

// Remove a shortcut for a preset
function removeShortcut(presetName) {
  chrome.storage.local.get('formShortcuts', (result) => {
    const shortcuts = result.formShortcuts || {};

    // Remove any shortcut assigned to this preset
    Object.keys(shortcuts).forEach((key) => {
      if (shortcuts[key] === presetName) {
        delete shortcuts[key];
      }
    });

    // Save to storage
    chrome.storage.local.set({ formShortcuts: shortcuts }, () => {
      // No need to reload since we manually updated the UI
    });
  });
}

// Show edit view for a preset
function showEditView(presetName) {
  chrome.storage.local.get('formPresets', (result) => {
    const presets = result.formPresets || {};
    const preset = presets[presetName];

    if (!preset) {
      alert('Preset not found');
      return;
    }

    // Hide list view, show edit view
    document.getElementById('presetListView').style.display = 'none';
    document.getElementById('editPresetView').style.display = 'block';

    // Set title
    document.getElementById('editPresetTitle').textContent = 'Edit Preset';

    // Populate fields
    const editFieldsList = document.getElementById('editFieldsList');
    editFieldsList.innerHTML = '';

    // Add preset name field at the top
    const nameField = document.createElement('div');
    nameField.className = 'edit-field-item';
    nameField.style.cssText = 'background: #f9f9f9; border: 2px solid #ddd;';
    nameField.innerHTML = `
      <div class="edit-field-label">Preset Name</div>
      <input type="text" id="editPresetName" class="edit-field-input" value="${presetName}" style="font-weight: 500;">
    `;
    editFieldsList.appendChild(nameField);

    const formData = preset.formData;

    // Create edit fields for each form field
    Object.entries(formData).forEach(([fieldId, fieldData]) => {
      const fieldItem = document.createElement('div');
      fieldItem.className = 'edit-field-item';
      fieldItem.dataset.fieldId = fieldId;

      // Extract a readable label from the field name
      let label = fieldData.name || 'Unnamed field';

      // Create the field HTML based on type
      let inputHtml = '';
      if (fieldData.type === 'checkbox' || fieldData.type === 'radio') {
        const checked = fieldData.value ? 'checked' : '';
        inputHtml = `
          <label>
            <input type="checkbox" class="edit-field-checkbox" ${checked} data-field-id="${fieldId}">
            ${fieldData.type === 'radio' ? 'Selected' : 'Checked'}
          </label>
        `;
      } else if (fieldData.type === 'textarea') {
        inputHtml = `<textarea class="edit-field-input" data-field-id="${fieldId}" rows="3">${
          fieldData.value || ''
        }</textarea>`;
      } else if (
        fieldData.type === 'select' ||
        fieldData.type === 'select-multiple'
      ) {
        inputHtml = `<input type="text" class="edit-field-input" data-field-id="${fieldId}" value="${
          fieldData.value || ''
        }">`;
      } else {
        inputHtml = `<input type="text" class="edit-field-input" data-field-id="${fieldId}" value="${
          fieldData.value || ''
        }">`;
      }

      fieldItem.innerHTML = `
        <div class="edit-field-label">${label}</div>
        <div class="edit-field-meta">Type: ${fieldData.type}</div>
        ${inputHtml}
      `;

      editFieldsList.appendChild(fieldItem);
    });

    // Setup back button
    document.getElementById('backButton').onclick = hideEditView;
    document.getElementById('cancelEditButton').onclick = hideEditView;

    // Setup save button - store original name for reference
    document.getElementById('saveEditButton').onclick = () => {
      savePresetEdits(presetName);
    };

    // Store original preset name as data attribute for later use
    document.getElementById('editPresetView').dataset.originalName = presetName;
  });
}

// Hide edit view and return to list view
function hideEditView() {
  document.getElementById('editPresetView').style.display = 'none';
  document.getElementById('presetListView').style.display = 'block';
}

// Save edits to a preset
function savePresetEdits(originalPresetName) {
  // Get the new preset name
  const newPresetName = document.getElementById('editPresetName').value.trim();

  if (!newPresetName) {
    alert('Preset name cannot be empty');
    return;
  }

  chrome.storage.local.get(['formPresets', 'formShortcuts'], (result) => {
    const presets = result.formPresets || {};
    const shortcuts = result.formShortcuts || {};
    const preset = presets[originalPresetName];

    if (!preset) {
      alert('Preset not found');
      return;
    }

    // Check if renaming to a different name that already exists
    if (newPresetName !== originalPresetName && presets[newPresetName]) {
      if (
        !confirm(
          `A preset named "${newPresetName}" already exists. Do you want to overwrite it?`
        )
      ) {
        return;
      }
    }

    // Collect updated values from the edit form
    const editFieldsList = document.getElementById('editFieldsList');
    const fieldItems = editFieldsList.querySelectorAll('.edit-field-item');

    fieldItems.forEach((fieldItem) => {
      const fieldId = fieldItem.dataset.fieldId;
      if (!fieldId) {
        return; // Skip the preset name field
      }

      const fieldData = preset.formData[fieldId];

      if (fieldData.type === 'checkbox' || fieldData.type === 'radio') {
        const checkbox = fieldItem.querySelector('.edit-field-checkbox');
        if (checkbox) {
          fieldData.value = checkbox.checked;
        }
      } else {
        const input = fieldItem.querySelector('.edit-field-input');
        if (input) {
          fieldData.value = input.value;
        }
      }
    });

    // If name changed, handle the rename
    if (newPresetName !== originalPresetName) {
      // Delete old preset
      delete presets[originalPresetName];

      // Update any shortcuts that point to the old name
      Object.keys(shortcuts).forEach((key) => {
        if (shortcuts[key] === originalPresetName) {
          shortcuts[key] = newPresetName;
        }
      });
    }

    // Save preset with new name
    presets[newPresetName] = preset;

    // Save back to storage
    chrome.storage.local.set(
      { formPresets: presets, formShortcuts: shortcuts },
      () => {
        // Update context menus
        chrome.runtime.sendMessage({ action: 'presetSaved' });

        // Go back to list view
        hideEditView();

        // Reload the list to show updated data
        loadPresets();
      }
    );
  });
}
