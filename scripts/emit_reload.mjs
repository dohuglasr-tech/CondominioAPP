import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kevslcecttfxifcplgzx.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtldnNsY2VjdHRmeGlmY3BsZ3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDExMTYsImV4cCI6MjEwNTYxNzExNn0.xmDYjTK5ZVdQsjyOyvtPYCRB4cQCINcGirM59M8ka2o'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function triggerReload() {
  const ahoraIso = new Date().toISOString()
  console.log(`[Reinicio Remoto] Iniciando emisión de señal a las ${ahoraIso}...`)

  // 1. Obtener registro de configuración
  const { data: configs, error: fetchErr } = await supabase
    .from('configuracion_edificio')
    .select('id, nombre_edificio, updated_at')
    .limit(1)

  if (fetchErr) {
    console.error('Error al consultar configuracion_edificio:', fetchErr)
  } else {
    console.log('Registro configuracion_edificio actual:', configs)
    if (configs && configs.length > 0) {
      const configId = configs[0].id
      const { data: updData, error: updErr } = await supabase
        .from('configuracion_edificio')
        .update({ updated_at: ahoraIso })
        .eq('id', configId)
        .select()
      
      if (updErr) {
        console.error('Error al actualizar updated_at en configuracion_edificio:', updErr)
      } else {
        console.log('✅ configuracion_edificio.updated_at actualizado con éxito:', updData)
      }
    }
  }

  // 2. Transmitir broadcast event por realtime
  const channel = supabase.channel('realtime_edificio_theme_sync')
  
  channel.subscribe(async (status) => {
    console.log(`Canal realtime status: ${status}`)
    if (status === 'SUBSCRIBED') {
      const sendRes = await channel.send({
        type: 'broadcast',
        event: 'force_app_reload',
        payload: {
          timestamp: Date.now(),
          version: '1.0.2',
          admin: 'Sistema Despliegue Producción',
          motivo: 'Actualización a v1.0.2 desplegada en producción'
        }
      })
      console.log('✅ Evento broadcast force_app_reload enviado:', sendRes)
      
      // Registrar en historial_auditoria
      try {
        await supabase.from('historial_auditoria').insert([{
          id: `reload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          fecha: ahoraIso,
          tipo_accion: 'SISTEMA_PURGA_CACHE',
          titulo: 'Despliegue a Producción v1.0.2 y Reinicio Remoto',
          descripcion: 'Se desplegó la versión 1.0.2 y se emitió la señal de reinicio automático y purga de caché a todos los dispositivos de residentes y administradores.',
          motivo: 'Actualización de producción y reinicio sincronizado',
          autor_nombre: 'Sistema / Administrador',
          created_at: ahoraIso,
        }])
        console.log('✅ Historial de auditoría registrado.')
      } catch (audErr) {
        console.warn('Nota auditoría:', audErr)
      }

      setTimeout(() => {
        process.exit(0)
      }, 1500)
    }
  })
}

triggerReload()
