require('dotenv').config();
const db = require('../services/database');
const proxmoxService = require('../services/proxmox');

async function updateVMAssignments() {
  console.log('Updating VM assignments to match real Proxmox VMs...\n');
  
  try {
    // Get all real VMs from Proxmox
    const allVMs = await proxmoxService.getVMs();
    const realVMs = allVMs
      .filter(vm => vm.template !== 1) // Exclude templates
      .sort((a, b) => a.vmid - b.vmid); // Sort by VM ID
    
    console.log('Found real VMs:');
    realVMs.forEach(vm => {
      console.log(`  VM ${vm.vmid}: ${vm.name || 'Unnamed'} (Status: ${vm.status})`);
    });
    
    if (realVMs.length === 0) {
      console.log('No real VMs found. Make sure you have VMs (not just templates) in Proxmox.');
      return;
    }
    
    // Get existing users
    const customer1 = await db.findUserByUsername('customer1');
    const customer2 = await db.findUserByUsername('customer2');
    
    if (!customer1) {
      console.log('customer1 not found. Run database setup first.');
      return;
    }
    
    // Clear existing assignments for customers
    console.log('\nClearing existing VM assignments...');
    const userVMIds1 = db.getUserVMIds(customer1.id);
    for (const vmId of userVMIds1) {
      db.removeVMFromUser(customer1.id, vmId);
    }
    
    if (customer2) {
      const userVMIds2 = db.getUserVMIds(customer2.id);
      for (const vmId of userVMIds2) {
        db.removeVMFromUser(customer2.id, vmId);
      }
    }
    
    // Assign VMs to users
    console.log('\nAssigning VMs to users...');
    
    if (realVMs.length >= 2) {
      // Split VMs between customer1 and customer2
      const half = Math.ceil(realVMs.length / 2);
      const customer1VMs = realVMs.slice(0, half);
      const customer2VMs = realVMs.slice(half);
      
      // Assign to customer1
      console.log(`  customer1 gets ${customer1VMs.length} VMs:`);
      for (const vm of customer1VMs) {
        db.assignVMToUser(customer1.id, vm.vmid);
        console.log(`    Assigned VM ${vm.vmid} (${vm.name || 'Unnamed'})`);
      }
      
      // Assign to customer2 (if exists)
      if (customer2 && customer2VMs.length > 0) {
        console.log(`  customer2 gets ${customer2VMs.length} VMs:`);
        for (const vm of customer2VMs) {
          db.assignVMToUser(customer2.id, vm.vmid);
          console.log(`    Assigned VM ${vm.vmid} (${vm.name || 'Unnamed'})`);
        }
      }
    } else {
      // Only one VM, assign to customer1
      const vm = realVMs[0];
      db.assignVMToUser(customer1.id, vm.vmid);
      console.log(`  customer1 gets VM ${vm.vmid} (${vm.name || 'Unnamed'})`);
      
      if (customer2) {
        console.log(`  customer2 gets no VMs (only 1 VM available)`);
      }
    }
    
    console.log('\nVM assignments updated successfully!');
    
    // Show final assignments
    console.log('\nFinal assignments:');
    const updatedCustomer1 = await db.findUserById(customer1.id);
    console.log(`  customer1: VMs [${updatedCustomer1.vmIds.join(', ')}]`);
    
    if (customer2) {
      const updatedCustomer2 = await db.findUserById(customer2.id);
      console.log(`  customer2: VMs [${updatedCustomer2.vmIds.join(', ')}]`);
    }
    
    console.log(`  admin: All VMs (${realVMs.map(vm => vm.vmid).join(', ')})`);
    
    console.log('\nYou can now restart the server and see your real VMs!');
    
  } catch (error) {
    console.error('Error updating VM assignments:', error.message);
  }
}

updateVMAssignments(); 