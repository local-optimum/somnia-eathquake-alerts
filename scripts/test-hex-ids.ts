/**
 * Test how toHex converts earthquake IDs
 */

import { toHex } from 'viem'

const testIds = [
  'hv74817311',
  'us7000nzwd',
  'nc74029621',
  'ak0250ckk3x6',
  'pr71438318'
]

console.log('\n🧪 Testing earthquake ID to Hex conversion:\n')

testIds.forEach(id => {
  const hex32 = toHex(id, { size: 32 })
  console.log(`${id.padEnd(15)} → ${hex32}`)
})

console.log('\n⚠️  Notice: If all IDs produce the same hex, that\'s the bug!')
console.log('   toHex() with strings might not be unique.\n')

