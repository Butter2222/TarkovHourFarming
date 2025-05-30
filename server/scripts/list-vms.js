require('dotenv').config();
const proxmoxService = require('../services/proxmox');

async function listVMs() {
  console.log('Connecting to Proxmox to list all VMs...\n');
  
  try {
    const allVMs = await proxmoxService.getVMs();
    
    console.log('All VMs from Proxmox:');
    console.log('='.repeat(80));
    
    // Separate templates and real VMs
    const templates = allVMs.filter(vm => vm.template === 1);
    const realVMs = allVMs.filter(vm => vm.template !== 1);
    
    // Sort by VM ID
    templates.sort((a, b) => a.vmid - b.vmid);
    realVMs.sort((a, b) => a.vmid - b.vmid);
    
    console.log(`\nReal VMs (${realVMs.length}):`);
    realVMs.forEach(vm => {
      console.log(`  VM ${vm.vmid}: ${vm.name || 'Unnamed'} (Status: ${vm.status})`);
    });
    
    if (templates.length > 0) {
      console.log(`\nTemplates (${templates.length}):`);
      templates.forEach(vm => {
        console.log(`  Template ${vm.vmid}: ${vm.name || 'Unnamed'}`);
      });
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`\nSummary:`);
    console.log(`  Total VMs: ${allVMs.length}`);
    console.log(`  Real VMs: ${realVMs.length}`);
    console.log(`  Templates: ${templates.length}`);
    
    if (realVMs.length > 0) {
      console.log(`\nSuggested VM assignments:`);
      console.log(`  Admin: All VMs (${realVMs.map(vm => vm.vmid).join(', ')})`);
      
      if (realVMs.length >= 2) {
        const half = Math.ceil(realVMs.length / 2);
        const customer1VMs = realVMs.slice(0, half).map(vm => vm.vmid);
        const customer2VMs = realVMs.slice(half).map(vm => vm.vmid);
        
        console.log(`  customer1: VMs ${customer1VMs.join(', ')}`);
        console.log(`  customer2: VMs ${customer2VMs.join(', ')}`);
      } else {
        console.log(`  customer1: VM ${realVMs[0].vmid}`);
        console.log(`  customer2: No VMs (add more VMs or create more users)`);
      }
    }
    
    console.log(`\n🔧 To update user assignments, run:`);
    console.log(`  node scripts/update-vm-assignments.js`);
    
  } catch (error) {
    console.error('❌ Error listing VMs:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('  1. Check your .env file has correct Proxmox settings');
    console.log('  2. Verify Proxmox server is accessible');
    console.log('  3. Ensure credentials are correct');
  }
}

listVMs(); 