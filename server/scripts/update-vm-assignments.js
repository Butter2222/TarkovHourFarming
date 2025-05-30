require('dotenv').config();
const db = require('../services/database');
const proxmoxService = require('../services/proxmox');

async function updateVMAssignments() {
  console.log('Checking available VMs in Proxmox...\n');
  
  try {
    // Get all real VMs from Proxmox
    const allVMs = await proxmoxService.getVMs();
    const realVMs = allVMs
      .filter(vm => vm.template !== 1) // Exclude templates
      .sort((a, b) => a.vmid - b.vmid); // Sort by VM ID
    
    console.log('Available VMs for management:');
    if (realVMs.length === 0) {
      console.log('  No VMs found. Make sure you have VMs (not just templates) in Proxmox.');
      console.log('  Note: Admin users can access all VMs when they are created.');
    } else {
      realVMs.forEach(vm => {
        console.log(`  VM ${vm.vmid}: ${vm.name || 'Unnamed'} (Status: ${vm.status})`);
      });
      console.log(`\nTotal: ${realVMs.length} VMs available`);
      console.log('Note: Admin users can manage all VMs through the dashboard.');
    }
    
    console.log('\nVM discovery complete!');
    
  } catch (error) {
    console.error('Error checking VMs:', error.message);
    console.log('Note: This is normal if Proxmox is not accessible during setup.');
    console.log('VMs will be discovered when the server starts and Proxmox is available.');
  }
}

updateVMAssignments(); 