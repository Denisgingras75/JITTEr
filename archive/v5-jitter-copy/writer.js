// --- UPDATED EXPORT / COPY LOGIC ---

function generateBadgeHTML(payload, type) {
    const json = JSON.stringify(payload);
    const base64 = btoa(json);
    
    // 1. The Payload URL (The Trojan Horse)
    // We use a fake fragment URL. The extension watches for this pattern.
    const safeUrl = `https://anvil.local/verify#${base64}`;
    
    // 2. Visual Styling (Inline styles are required for Gmail/Docs)
    let color, bgColor, label;
    
    if (type === 'passport') {
        color = '#b45309'; // Darker Gold for contrast
        bgColor = '#fffbeb';
        label = `👤 ${payload.rank} Human`;
    } else {
        // Project Logic
        const isClean = payload.purity >= 80;
        color = isClean ? '#059669' : '#dc2626'; // Green or Red
        bgColor = isClean ? '#ecfdf5' : '#fef2f2';
        label = `🛡️ Verified Human | ${payload.purity}%`;
    }

    const tooltip = `Anvil Protocol Verified\nDate: ${payload.date}`;

    // 3. The Construct (Anchor + Span)
    // The <a> tag ensures the data survives copy-paste sanitization.
    // The <span> handles the pill shape and color.
    return `
    <a href="${safeUrl}" 
       style="text-decoration: none; cursor: pointer; display: inline-block;"
       data-anvil-payload="${base64}">
        <span style="
            display: inline-block;
            background-color: ${bgColor};
            color: ${color};
            border: 1px solid ${color};
            padding: 2px 10px;
            border-radius: 99px;
            font-family: ui-sans-serif, system-ui, sans-serif;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.5;
            white-space: nowrap;
            vertical-align: middle;
        " title="${tooltip}">
            ${label}
        </span>
    </a>`.replace(/\s+/g, ' '); // Minify whitespace
}

// ... inside your btn-export listener ...
document.getElementById('btn-export').addEventListener('click', () => {
    // ... existing math ...
    
    const payload = {
        type: 'project',
        title: 'Verified Draft',
        purity: purity,
        human: session.humanChars,
        alien: session.alienChars,
        date: new Date().toLocaleDateString()
    };

    const htmlBadge = generateBadgeHTML(payload, 'project');
    const plainBadge = `[ ${payload.purity}% Verified Human ]`;
    
    // Combine Badge + Content
    const exportHTML = `${htmlBadge}<br><br>${editor.innerText.replace(/\n/g, "<br>")}`;
    const exportText = `${plainBadge}\n\n${editor.innerText}`;

    // Write to Clipboard
    const blobHtml = new Blob([exportHTML], { type: 'text/html' });
    const blobText = new Blob([exportText], { type: 'text/plain' });
    navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })])
        .then(() => alert("✅ Document Signed & Copied"))
        .catch(err => alert("❌ Clipboard Error"));
});