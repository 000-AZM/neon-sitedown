document.addEventListener('DOMContentLoaded', () => {
    const rawDataArea = document.getElementById('raw-data');
    const parseBtn = document.getElementById('parse-btn');
    const clearBtn = document.getElementById('clear-btn');
    const tableBody = document.getElementById('table-body');
    const totalDownSpan = document.getElementById('total-down');
    const searchInput = document.getElementById('search-site');
    const filterOwner = document.getElementById('filter-owner');
    const exportExcelBtn = document.getElementById('export-excel');
    const exportImageBtn = document.getElementById('export-image');

    let siteData = [];
    let siteMappings = {};

    // --- Load Site Mappings ---
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            // Convert array format to lookup object for faster access
            if (Array.isArray(data)) {
                data.forEach(item => {
                    const siteCode = item["Site Code"];
                    if (siteCode) {
                        siteMappings[siteCode] = {
                            team: item["Team"] || "",
                            unsafe: item["Unsafe"] || "",
                            powerModel: item["Power Model"] || ""
                        };
                    }
                });
            } else {
                siteMappings = data;
            }
            console.log('Site mappings loaded and processed:', siteMappings);
        })
        .catch(err => console.error('Failed to load site mappings:', err));

    // --- Parsing Logic ---
    parseBtn.addEventListener('click', () => {
        const text = rawDataArea.value.trim();
        if (!text) return;

        // Extract Report Time
        const timeMatch = text.match(/(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})/);
        const reportTimeStr = timeMatch ? timeMatch[1] : null;
        
        let reportTime;
        if (reportTimeStr) {
            const [datePart, timePart] = reportTimeStr.split(' ');
            const [day, month, year] = datePart.split('/');
            reportTime = new Date(`${year}-${month}-${day}T${timePart}`);
        } else {
            reportTime = new Date();
        }

        // Split into lines and find the table part
        const lines = text.split('\n');
        const startIndex = lines.findIndex(line => line.includes('STATION') && line.includes('DURATION'));
        
        if (startIndex === -1) {
            alert('Could not find data table in the pasted text.');
            return;
        }

        const newSites = [];
        for (let i = startIndex + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.includes('Total sites down')) continue;

            // Split by common separators: │, |, or multiple spaces
            const parts = line.split(/[│|]|\s{2,}/).map(p => p.trim()).filter(p => p);
            
            if (parts.length >= 4) {
                const siteId = parts[0];
                const durationStr = parts[1].replace(' h', '');
                const duration = parseFloat(durationStr);
                const owner = parts[2];
                const powerModel = parts[3];

                // Calculate Start Time = Report Time - Duration
                let startTimeStr = '';
                if (!isNaN(duration)) {
                    const startTime = new Date(reportTime.getTime() - (duration * 60 * 60 * 1000));
                    startTimeStr = startTime.toLocaleString();
                }

                // Apply mappings from JSON if available
                const mapping = siteMappings[siteId] || {};
                const team = mapping.team || '';
                const unsafeZone = mapping.unsafe || '';
                // Use JSON power model if available, otherwise use parsed one
                const finalPowerModel = mapping.powerModel || powerModel;

                newSites.push({
                    siteId,
                    owner,
                    startTime: startTimeStr,
                    duration,
                    team,
                    powerModel: finalPowerModel,
                    unsafeZone
                });
            }
        }

        siteData = [...siteData, ...newSites];
        updateTable();
        updateFilters();
    });

    clearBtn.addEventListener('click', () => {
        siteData = [];
        rawDataArea.value = '';
        updateTable();
        updateFilters();
    });

    // --- Table Rendering ---
    function updateTable() {
        const searchTerm = searchInput.value.toLowerCase();
        const ownerFilter = filterOwner.value;

        const filteredData = siteData.filter(site => {
            const matchesSearch = site.siteId.toLowerCase().includes(searchTerm);
            const matchesOwner = ownerFilter === '' || site.owner === ownerFilter;
            return matchesSearch && matchesOwner;
        });

        tableBody.innerHTML = '';
        filteredData.forEach((site, index) => {
            const tr = document.createElement('tr');
            
            // Highlight based on duration
            if (site.duration > 24) {
                tr.classList.add('high-duration');
                tr.style.color = '#c92a2a'; // Material Red
                tr.style.fontWeight = '600';
            } else if (site.duration > 12) {
                tr.classList.add('medium-duration');
                tr.style.color = '#862e01'; // Material Dark Yellow/Orange
                tr.style.fontWeight = '600';
            }

            tr.innerHTML = `
                <td>${index + 1}</td>
                <td contenteditable="true" class="editable-cell" data-field="siteId">${site.siteId}</td>
                <td contenteditable="true" class="editable-cell" data-field="owner">${site.owner}</td>
                <td contenteditable="true" class="editable-cell" data-field="startTime">${site.startTime}</td>
                <td contenteditable="true" class="editable-cell" data-field="duration">${site.duration}</td>
                <td contenteditable="true" class="editable-cell" data-field="team">${site.team}</td>
                <td contenteditable="true" class="editable-cell" data-field="powerModel">${site.powerModel}</td>
                <td contenteditable="true" class="editable-cell" data-field="unsafeZone">${site.unsafeZone}</td>
            `;

            // Add event listeners for editable cells
            tr.querySelectorAll('.editable-cell').forEach(cell => {
                cell.addEventListener('blur', (e) => {
                    const field = e.target.dataset.field;
                    const value = e.target.innerText;
                    siteData[index][field] = field === 'duration' ? parseFloat(value) : value;
                    if (field === 'duration') updateTable(); // Re-highlight if duration changed
                });
            });

            tableBody.appendChild(tr);
        });

        totalDownSpan.innerText = filteredData.length;
    }

    function updateFilters() {
        const owners = [...new Set(siteData.map(s => s.owner))];
        const currentFilter = filterOwner.value;
        filterOwner.innerHTML = '<option value="">All Owners</option>';
        owners.forEach(owner => {
            const opt = document.createElement('option');
            opt.value = owner;
            opt.innerText = owner;
            if (owner === currentFilter) opt.selected = true;
            filterOwner.appendChild(opt);
        });
    }

    // --- Search & Filter Events ---
    searchInput.addEventListener('input', updateTable);
    filterOwner.addEventListener('change', updateTable);

    // --- Sorting ---
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            siteData.sort((a, b) => {
                if (typeof a[field] === 'number') return b[field] - a[field];
                return a[field].localeCompare(b[field]);
            });
            updateTable();
        });
    });

    // --- Export Logic ---
    exportExcelBtn.addEventListener('click', () => {
        if (siteData.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(siteData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sites Down");
        XLSX.writeFile(workbook, "Site_Down_Report.xlsx");
    });

    exportImageBtn.addEventListener('click', () => {
        const table = document.getElementById('monitor-table');
        if (!table || siteData.length === 0) return;

        // Show a simple loading state
        exportImageBtn.innerText = 'CAPTURING...';
        exportImageBtn.disabled = true;

        // Use html2canvas to capture the actual table element, not the wrapper
        html2canvas(table, {
            backgroundColor: '#ffffff',
            scale: 2, // High quality
            useCORS: true,
            logging: false,
            onclone: (clonedDoc) => {
                // Ensure the cloned table is fully visible for capture
                const clonedTable = clonedDoc.getElementById('monitor-table');
                clonedTable.style.maxHeight = 'none';
                clonedTable.style.overflow = 'visible';
            }
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `Site_Down_Report_${new Date().getTime()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            
            // Reset button state
            exportImageBtn.innerText = 'IMAGE';
            exportImageBtn.disabled = false;
        }).catch(err => {
            console.error('Capture failed:', err);
            exportImageBtn.innerText = 'IMAGE';
            exportImageBtn.disabled = false;
            alert('Failed to capture image. Please try again.');
        });
    });
});

// Function to handle image export (Action button)
document.getElementById('export-image').addEventListener('click', () => {
    html2canvas(document.querySelector("#capture-area")).then(canvas => {
        let link = document.createElement('a');
        link.download = 'alarm-monitor.png';
        link.href = canvas.toDataURL();
        link.click();
    });
});

// Function to handle Excel export
document.getElementById('export-excel').addEventListener('click', () => {
    const table = document.getElementById("monitor-table");
    const wb = XLSX.utils.table_to_book(table);
    XLSX.writeFile(wb, "Alarm_Report.xlsx");
});

// Mock Parse logic (update this with your actual parser)
document.getElementById('parse-btn').addEventListener('click', () => {
    const tableBody = document.getElementById('table-body');
    // Your logic to take textarea input and turn it into <tr><td>...</td></tr>
    console.log("Searching/Parsing data...");
});
