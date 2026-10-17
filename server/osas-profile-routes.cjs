const express = require('express')
const crypto = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs/promises')

// Add this router to your CURRENT server/index.cjs (do not replace the entire backend).
module.exports = function createOsasProfileRoutes(pool, requireOsas, checkOrigin, accountLimiter, uploadDirectory) {
  const router=express.Router()
  const photoParser=express.raw({type:['image/jpeg','image/png','image/webp'],limit:'2mb'})
  router.get('/photo',requireOsas,async(req,res)=>{
    try{
      const r=await pool.query('SELECT profile_photo_path FROM public.osas_accounts WHERE id=$1 AND is_active=TRUE',[req.session.osasAccountId])
      const name=r.rows[0]?.profile_photo_path
      if(!name||!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(name))return res.sendStatus(404)
      res.set('Cache-Control','no-store')
      return res.sendFile(path.join(uploadDirectory,name))
    }catch(e){console.error('OSAS photo read:',e.message);return res.sendStatus(404)}
  })
  router.post('/photo',checkOrigin,requireOsas,photoParser,async(req,res)=>{
    const data=req.body
    if(!Buffer.isBuffer(data)||!data.length)return res.status(400).json({error:'No photo provided'})
    let ext=null
    if(data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255)ext='jpg'
    else if(data.length>=8&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ext='png'
    else if(data.length>=12&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')ext='webp'
    if(!ext)return res.status(400).json({error:'Invalid photo format'})
    const filename=`${crypto.randomUUID()}.${ext}`,filenamePath=path.join(uploadDirectory,filename)
    try{
      await fs.mkdir(uploadDirectory,{recursive:true});await fs.writeFile(filenamePath,data,{flag:'wx'})
      const r=await pool.query('UPDATE public.osas_accounts SET profile_photo_path=$1,updated_at=NOW() WHERE id=$2 AND is_active=TRUE RETURNING id',[filename,req.session.osasAccountId])
      if(!r.rowCount){await fs.unlink(filenamePath).catch(()=>{});return res.status(404).json({error:'OSAS account unavailable'})}
      return res.json({success:true})
    }catch(e){await fs.unlink(filenamePath).catch(()=>{});console.error('OSAS photo upload:',e.message);return res.status(500).json({error:'Unable to upload photo'})}
  })
  router.put('/username',checkOrigin,accountLimiter,requireOsas,async(req,res)=>{
    const username=typeof req.body?.username==='string'?req.body.username.trim().toLowerCase():''
    const currentPassword=req.body?.currentPassword
    if(!/^[a-z0-9][a-z0-9-]{2,49}$/.test(username)||typeof currentPassword!=='string')return res.status(400).json({error:'Invalid username or password'})
    try{
      const r=await pool.query(`UPDATE public.osas_accounts SET username=$1,updated_at=NOW() WHERE id=$2 AND is_active=TRUE AND password_hash=extensions.crypt($3,password_hash) RETURNING username`,[username,req.session.osasAccountId,currentPassword])
      if(!r.rowCount)return res.status(400).json({error:'Current password is incorrect'})
      return res.json({username:r.rows[0].username})
    }catch(e){if(e.code==='23505')return res.status(409).json({error:'Username already exists'});console.error('OSAS username:',e.message);return res.status(500).json({error:'Unable to update username'})}
  })
  router.put('/change-password',checkOrigin,accountLimiter,requireOsas,async(req,res)=>{
    const {currentPassword,newPassword}=req.body||{}
    if(typeof currentPassword!=='string'||typeof newPassword!=='string'||!currentPassword||newPassword.length<12||Buffer.byteLength(newPassword,'utf8')>72||currentPassword===newPassword)return res.status(400).json({error:'Use a different password of at least 12 characters and at most 72 UTF-8 bytes'})
    try{
      const r=await pool.query(`UPDATE public.osas_accounts SET password_hash=extensions.crypt($1,extensions.gen_salt('bf',12)),updated_at=NOW() WHERE id=$2 AND is_active=TRUE AND password_hash=extensions.crypt($3,password_hash) RETURNING id`,[newPassword,req.session.osasAccountId,currentPassword])
      if(!r.rowCount)return res.status(400).json({error:'Current password is incorrect'})
      return res.json({success:true})
    }catch(e){console.error('OSAS password:',e.message);return res.status(500).json({error:'Unable to change password'})}
  })
  return router
}
