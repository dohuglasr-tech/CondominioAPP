import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kevslcecttfxifcplgzx.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtldnNsY2VjdHRmeGlmY3BsZ3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDExMTYsImV4cCI6MjEwNTYxNzExNn0.xmDYjTK5ZVdQsjyOyvtPYCRB4cQCINcGirM59M8ka2o'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function main() {
  const { data, error } = await supabase
    .from('apartamentos')
    .select('id, numero, piso, alicuota, propietario_nombre')
    .order('numero', { ascending: true })

  if (error) {
    console.error('Error fetching apartamentos:', error)
    return
  }

  console.log(`Total apartamentos encontrados: ${data.length}`)
  console.log('Muestra:', data.slice(0, 5))
  console.log('PHs o últimos:', data.filter(a => a.numero.toLowerCase().includes('ph') || a.piso === 11 || a.piso === 0))
}

main()
