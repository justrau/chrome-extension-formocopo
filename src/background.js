// Create context menu items when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  // Create "Save Form" context menu item
  chrome.contextMenus.create({
    id: 'saveForm',
    title: 'Save form',
    contexts: ['all'],
  });

  // No longer need the "Fill Form" parent menu
  // We'll add presets directly at the root level
  updateFillFormMenu();
});

// Listen for context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'saveForm') {
    chrome.tabs.sendMessage(tab.id, { action: 'saveForm' });
  } else if (info.menuItemId === 'copyForm') {
    chrome.tabs.sendMessage(tab.id, { action: 'copyForm' });
  } else if (info.menuItemId === 'pasteForm') {
    chrome.tabs.sendMessage(tab.id, { action: 'pasteForm' });
  } else if (info.menuItemId.startsWith('preset-')) {
    const presetName = info.menuItemId.replace('preset-', '');
    chrome.tabs.sendMessage(tab.id, {
      action: 'fillForm',
      presetName: presetName,
    });
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // When a new form preset is saved, update the context menu
  if (message.action === 'presetSaved') {
    updateFillFormMenu();
  }
});

// Function to update the context menu with available presets
function updateFillFormMenu() {
  // First remove existing preset items
  chrome.contextMenus.removeAll(() => {
    // Recreate the "Save Form" menu item
    chrome.contextMenus.create({
      id: 'saveForm',
      title: 'Save form',
      contexts: ['all'],
    });

    // Add "Copy Form" menu item
    chrome.contextMenus.create({
      id: 'copyForm',
      title: 'Copy form',
      contexts: ['all'],
    });

    // Add a separator
    chrome.contextMenus.create({
      id: 'separator',
      type: 'separator',
      contexts: ['all'],
    });

    // Add "Paste Form" menu item
    chrome.contextMenus.create({
      id: 'pasteForm',
      title: 'Paste form',
      contexts: ['all'],
    });

    // Get saved presets and add them to the root menu
    chrome.storage.local.get('formPresets', (result) => {
      const presets = result.formPresets || {};

      if (Object.keys(presets).length === 0) {
        // If no presets, add a disabled item
        chrome.contextMenus.create({
          id: 'noPresets',
          title: 'No presets available',
          enabled: false,
          contexts: ['all'],
        });
      } else {
        // Create an array of preset entries with name and savedAt time
        const presetEntries = Object.entries(presets).map(([name, data]) => ({
          name,
          savedAt: data.savedAt || '1970-01-01T00:00:00.000Z', // Default for presets without timestamp
        }));

        // Sort by savedAt timestamp, most recent first
        presetEntries.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

        // Add each preset directly to the root menu, in sorted order
        presetEntries.forEach((entry) => {
          chrome.contextMenus.create({
            id: 'preset-' + entry.name,
            title: 'Fill: ' + entry.name,
            contexts: ['all'],
          });
        });
      }
    });
  });
}
