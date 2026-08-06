// Английские описания для точек, добавленных из обновлённой версии статьи.
import { readFile, writeFile } from 'node:fs/promises';

const EN = {
  'streets-e598ac2d': 'TerraGroup office (security room) in the Cardinal building',
  'streets-edc7ceb3': "2nd floor of the financial institution, in the room locked with the financial institution office key",
  'streets-6d6e285a': 'Cardinal building, "Unity Bank"',
  'reserve-8ea1eb18': 'In a desk in the building by the "Checkpoint Fence" extract',
  'reserve-4b6bed63': '1st floor of the small building by the "Checkpoint Fence" extract',
  'reserve-3a4839ef': '4th floor of the Black Pawn, in the open armoury',
  'icebreaker-83f30435': 'Cabin deck, 2nd floor — meeting room locked with a code lock',
  'icebreaker-423f3f20': "On the table in the captain's bridge",
  'icebreaker-59995411': "In the infirmary, opposite the engineer's corpse",
  'icebreaker-ef404d52': 'In the small room before the helipad',
  'lighthouse-d818625e': '2nd floor of the lower chalet, in the room with access to the awning',
  'lighthouse-a8b2393f': '1st floor of the brick house in the village, next to the "Path to Shoreline" extract',
  'lighthouse-e8345406': '3rd floor of the lower chalet, by the dresser behind the bed',
  'customs-073e8815': "Reshala's base, in the room with weapon crates and a medical container",
  'customs-0d68bf19': 'Under the table on the 3rd floor of Warehouse 17',
  'factory-d28541e8': 'On the bench next to the crates by Gate 1',
  'factory-240b52af': 'In the single-storey annex opposite Gate 2 (1/2)',
  'factory-c2b6e309': 'In the single-storey annex opposite Gate 2 (2/2)',
  'factory-4130e6c5': 'On a pallet in the basements, closer to the offices on the "Gate 0" side',
  'factory-4249cd02': 'Behind Gate 2, in the room with an exit to the street',
  'factory-3707e4b0': '3rd floor of the offices, by the desk with a working computer',
  'factory-92e6dea0': 'In the basements near the medical tent, at the feet of a dead PMC',
  'woods-dda02a64': 'USEC camp, in the crate under the canopy',
  'woods-181c4841': 'In the portable toilet at the USEC checkpoint',
  'woods-0f62e873': 'In the tent at the USEC camp',
  'woods-03c02982': 'By the locked bunker on the mountain slope',
  'woods-49582adb': 'In the ruined village, in the house with cultist markings',
  'woods-8d82fd9b': 'At the USEC camp',
  'woods-95a5432a': 'At the sawmill, in the shack marked with the number 3',
  'woods-218fadd3': 'On a wooden crate at the EMERCOM base',
  'shoreline-e3cad41b': 'On the stretchers by the "Norvinsky" building',
  'shoreline-f0cf971d': '2nd floor of the shacks next to the vehicle extract',
  'shoreline-798601fc': 'In a house in the village (the second one along the minefield from the "Tunnel" extract)',
  'shoreline-77f16aa8': 'At the weather station, in the room up the tower',
  'groundzero-ff0ed192': 'In the cafeteria by the TerraGroup office',
  'groundzero-2383677d': '2nd floor of the TerraGroup office (the room where Mechanic\'s "Saving the Mole" quest is done)',
  'groundzero-78118135': '1st floor of the building with the "Utyos"',
  'groundzero-a12f3d21': 'In the wheelchair at the "EMERCOM Checkpoint" extract',
  'groundzero-aeaf1188': 'On the benches by the "Nakatani" building',
  'groundzero-671db510': '"Fusion" restaurant on the 1st floor',
  'lab-183c8d70': 'Round table at the "Cats"',
  'lab-61c29df1': '2nd floor offices, the ones closest to the area locked with the TerraGroup Labs keycard (Green)',
  'lab-396bfe59': "On the wooden table below the manager's office",
  'lab-927d9828': '3rd floor, in the open ward section',
  'lab-2fe1203c': 'On the floor in the room locked with the TerraGroup keycard (Blue)',
  'lab-8053eb6f': '3rd floor, on a bed in the corridor',
  'lab-4030228d': '2nd floor open laboratories (the room adjoining the lab locked with the TerraGroup Labs keycard (Blue))',
  'labyrinth-debd8b47': 'On the body bag next to the spawn with the toxic pool',
};

const path = new URL('../data/spawns.json', import.meta.url);
const spawns = JSON.parse(await readFile(path, 'utf8'));

let filled = 0;
for (const s of spawns) {
  if (EN[s.id] && !s.captionEn) {
    s.captionEn = EN[s.id];
    filled++;
  }
}

await writeFile(path, JSON.stringify(spawns, null, 2) + '\n');

const left = spawns.filter((s) => s.caption && !s.captionEn);
console.log(`проставлено: ${filled}`);
console.log(`без английского описания осталось: ${left.length}`);
for (const s of left) console.log(`  ${s.id}: ${s.caption}`);
console.log(`всего точек: ${spawns.length} · размечено: ${spawns.filter((s) => s.x != null).length}`);
