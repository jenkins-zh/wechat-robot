#!/usr/bin/env node

const HELPER_CONTACT_NAME = 'JenkinsInChina'

/* tslint:disable:variable-name */
const qrTerm = require('qrcode-terminal')

const {
  config,
  Contact,
  Room,
  Wechaty,
  log,
}             = require('wechaty')

const welcome = `
=============== Powered by Wechaty ===============
-------- https://github.com/Chatie/wechaty --------
Hello,
I'm a Wechaty Botie with the following super powers:
1. Find a room
2. Add people to room
3. Del people from room
4. Change room topic
5. Monitor room events
6. etc...
If you send a message of magic word 'ding',
you will get a invitation to join my own room!
__________________________________________________
Hope you like it, and you are very welcome to
upgrade me for more super powers!
Please wait... I'm trying to login in...
`
console.log(welcome)
const bot = Wechaty.instance({ profile: config.default.DEFAULT_PROFILE })

bot
.on('scan', (qrcode, status) => {
  qrTerm.generate(qrcode, { small: true })
  console.log(`${qrcode}\n[${status}] Scan QR Code in above url to login: `)
})
.on('logout'	, user => log.info('Bot', `"${user.name()}" logouted`))
.on('error'   , e => log.info('Bot', 'error: %s', e))

/**
 * Global Event: login
 *
 * do initialization inside this event.
 * (better to set a timeout, for browser need time to download other data)
 */
.on('login', async function(user) {
  let msg = `${user.name()} logined`

  log.info('Bot', msg)
  await this.say(msg)

  msg = `setting to manageDingRoom() after 3 seconds ... `
  log.info('Bot', msg)
  await this.say(msg)

  setTimeout(manageDingRoom.bind(this), 3000)
})

/**
 * Global Event: room-join
 */
.on('room-join', async function(room, inviteeList, inviter) {
  const topic = await room.topic()
  log.info( 'Bot', 'EVENT: room-join - Room "%s" got new member "%s", invited by "%s"',
            topic,
            inviteeList.map(c => c.name()).join(','),
            inviter.name(),
          )
  console.log('bot room-join room id:', room.id)
  if(shouldManageTheTopic(topic)) {
    await room.say(`欢迎加入，请及时阅读公告:)`, inviteeList[0])
  }
})

/**
 * Global Event: room-leave
 */
.on('room-leave', async function(room, leaverList) {
  const topic = await room.topic()
  log.info('Bot', 'EVENT: room-leave - Room "%s" lost member "%s"',
                  topic,
                  leaverList.map(c => c.name()).join(','),
              )
  if(shouldManageTheTopic(topic)) {
    const name  = leaverList[0] ? leaverList[0].name() : 'no contact!'
    await room.say(`kick off "${name}" from "${topic}"!` )
  }
})

/**
 * Global Event: room-topic
 */
.on('room-topic', async function(room, topic, oldTopic, changer) {
  if(!shouldManageTheTopic(topic)) {
    return
  }
  try {
    log.info('Bot', 'EVENT: room-topic - Room "%s" change topic from "%s" to "%s" by member "%s"',
                    room,
                    oldTopic,
                    topic,
                    changer,
                )
    await room.say(`room-topic - change topic from "${oldTopic}" to "${topic}" by member "${changer.name()}"` )
  } catch (e) {
    log.error('Bot', 'room-topic event exception: %s', e.stack)
  }
})

/**
 * Global Event: message
 */
.on('message', async function(msg) {
  if (msg.age() > 3 * 60) {
    log.info('Bot', 'on(message) skip age("%d") > 3 * 60 seconds: "%s"', msg.age(), msg)
    return
  }

  const room = msg.room()
  const from = msg.from()
  const text = msg.text()

  if (!from) {
    return
  }

  console.log((room ? '[' + await room.topic() + ']' : '')
              + '<' + from.name() + '>'
              + ':' + msg,
  )

  if (msg.self()) {
    return // skip self
  }

  if (room) {
    if (shouldManageTheTopic(room.topic())) {
      /**
       * move contact out of room
       */
      // await getOutRoom(from, room)
      if (/^违规/i.test(text)) {
        msg = text
        msg = msg.replace('违规', '')
        room.say(msg + '，你违规一次')
      }
    }
    return
  }

  /**
   * `ding` will be the magic(toggle) word:
   *  1. say ding first time, will got a room invitation
   *  2. say ding in room, will be removed out
   */
  if (/^加入Jenkins(技术交流|咨询|活动)$/i.test(text)) {
    msg = text
    msg = msg.replace('加入', '')
    msg = msg.replace('Jenkins', 'Jenkins中文社区')
    
    /**
     *  in-room message
     */
    if (room) {
      if (shouldManageTheTopic(room.topic())) {
        /**
         * move contact out of room
         */
        // await getOutRoom(from, room)
      }
    } else {
      /**
       * find room name start with "ding"
       */
      try {
        const dingRoom = await this.Room.find({ topic: new RegExp("^" + msg, "i") })
        if (dingRoom) {
          /**
           * room found
           */
          log.info('Bot', 'onMessage: got dingRoom: "%s"', await dingRoom.topic())

          if (await dingRoom.has(from)) {
            /**
             * speaker is already in room
             */
            const topic = await dingRoom.topic()
            log.info('Bot', 'onMessage: sender has already in dingRoom')
            // await dingRoom.say(`I found you have joined in room "${topic}"!`, from)
            await from.say(`no need to ding again, because you are already in room: "${topic}"`)
            // sendMessage({
            //   content: 'no need to ding again, because you are already in ding room'
            //   , to: sender
            // })

          } else {
            /**
             * put speaker into room
             */
            log.info('Bot', 'onMessage: add sender("%s") to dingRoom("%s")', from.name(), dingRoom.topic())
            await from.say('稍等，我会把你拉进入"' + msg + '"。')
            await putInRoom(from, dingRoom)
          }

        } else {
          await from.say('抱歉，我们还没有名叫"' + msg + '"的群！')
        }
      } catch (e) {
        log.error(e)
      }
    }
  } else if (/^加入Jenkins$/i.test(text)) {
    await from.say('抱歉，请按照格式回复：\n加入Jenkins技术交流（或咨询、活动）')
  }
})
.on('friendship', onFriendship)
.start()
.catch(e => console.error(e))

async function onFriendship(friendship) {
  if (friendship.type() == bot.Friendship.Type.Receive) {
      const hello = friendship.hello()
      if (isAddFriendAsJenkins(hello)) {
        await friendship.accept();

        await new Promise(r => setTimeout(r, 1000))
        try {
          msg = hello
          msg = msg.replace('社区', '')
          msg = msg.replace('Jenkins', 'Jenkins中文社区')
          const dingRoom = await this.Room.find({ topic: new RegExp("^" + msg, "i") })
          if (dingRoom) {
            /**
             * room found
             */
            log.info('Bot', 'onMessage: got dingRoom: "%s"', await dingRoom.topic())

            if (await dingRoom.has(from)) {
              /**
               * speaker is already in room
               */
              const topic = await dingRoom.topic()
              log.info('Bot', 'onMessage: sender has already in dingRoom')
              // await dingRoom.say(`I found you have joined in room "${topic}"!`, from)
              await from.say(`no need to ding again, because you are already in room: "${topic}"`)
              // sendMessage({
              //   content: 'no need to ding again, because you are already in ding room'
              //   , to: sender
              // })

            } else {
              /**
               * put speaker into room
               */
              log.info('Bot', 'onMessage: add sender("%s") to dingRoom("%s")', from.name(), dingRoom.topic())
              await from.say('稍等，我会把你拉进入"' + msg + '"。')
              await putInRoom(from, dingRoom)
            }

          } else {
            await from.say('抱歉，我们还没有名叫"' + msg + '"的群！')
          }
        } catch (e) {
          log.error(e)
        }
      }
  } else if (friendship.type() == bot.Friendship.Type.Confirm) {
      var contact = await friendship.contact();
      await contact.sync();
  }
}

async function manageDingRoom() {
  log.info('Bot', 'manageDingRoom()')

  /**
   * Find Room
   */
  try {
    const room = await bot.Room.find({ topic: /^Jenkins/i })
    if (!room) {
      log.warn('Bot', 'there is no room topic Jenkins(yet)')
      return
    }
    log.info('Bot', 'start monitor "Jenkins" room join/leave/topic event')

    /**
     * Event: Join
     */
    room.on('join', function(inviteeList, inviter) {
      log.verbose('Bot', 'Room EVENT: join - "%s", "%s"',
                         inviteeList.map(c => c.name()).join(', '),
                         inviter.name(),
      )
      console.log('room.on(join) id:', this.id)
      checkRoomJoin.call(this, room, inviteeList, inviter)
    })

    /**
     * Event: Leave
     */
    room.on('leave', (leaverList, remover) => {
      log.info('Bot', 'Room EVENT: leave - "%s" leave(remover "%s"), byebye', leaverList.join(','), remover || 'unknown')
    })

    /**
     * Event: Topic Change
     */
    room.on('topic', (topic, oldTopic, changer) => {
      log.info('Bot', 'Room EVENT: topic - changed from "%s" to "%s" by member "%s"',
            oldTopic,
            topic,
            changer.name(),
        )
    })
  } catch (e) {
    log.warn('Bot', 'Room.find rejected: "%s"', e.stack)
  }
}

async function checkRoomJoin(room, inviteeList, inviter) {
  log.info('Bot', 'checkRoomJoin("%s", "%s", "%s")',
                  await room.topic(),
                  inviteeList.map(c => c.name()).join(','),
                  inviter.name(),
          )

  await room.say('欢迎加入，请及时阅读公告:)')
}

async function putInRoom(contact, room) {
  log.info('Bot', 'putInRoom("%s", "%s")', contact.name(), await room.topic())

  try {
    await room.add(contact)
    setTimeout(
      _ => room.say('Welcome ', contact),
      10 * 1000,
    )
  } catch (e) {
    log.error('Bot', 'putInRoom() exception: ' + e.stack)
  }
}

async function getOutRoom(contact, room) {
  log.info('Bot', 'getOutRoom("%s", "%s")', contact, room)

  try {
    await room.say('You said "ding" in my room, I will remove you out.')
    await room.del(contact)
  } catch (e) {
    log.error('Bot', 'getOutRoom() exception: ' + e.stack)
  }
}

function getHelperContact() {
  log.info('Bot', 'getHelperContact()')

  // create a new room at least need 3 contacts
  return bot.Contact.find({ name: HELPER_CONTACT_NAME })
}

async function createDingRoom(contact) {
  log.info('Bot', 'createDingRoom("%s")', contact)

  try {
    const helperContact = await getHelperContact()

    if (!helperContact) {
      log.warn('Bot', 'getHelperContact() found nobody')
      await contact.say(`You don't have a friend called "${HELPER_CONTACT_NAME}",
                         because create a new room at least need 3 contacts, please set [HELPER_CONTACT_NAME] in the code first!`)
      return
    }

    log.info('Bot', 'getHelperContact() ok. got: "%s"', helperContact.name())

    const contactList = [contact, helperContact]
    log.verbose('Bot', 'contactList: "%s"', contactList.join(','))

    await contact.say(`There isn't ding room. I'm trying to create a room with "${helperContact.name()}" and you`)
    const room = await bot.Room.create(contactList, 'ding')
    log.info('Bot', 'createDingRoom() new ding room created: "%s"', room)

    await room.topic('ding - created')
    await room.say('ding - created')

    return room

  } catch (e) {
    log.error('Bot', 'getHelperContact() exception:', e.stack)
    throw e
  }
}

/**
 * Should or not take over the topic
 * @param {*} msg 
 */
async function shouldTakeOver(msg){
  const text = msg.text()

  return (/^加入Jenkins(技术交流|咨询|活动)$/i.test(text))
}

async function shouldManageTheTopic(topic) {
  return (/^Jenkins中文社区(技术交流|咨询|活动)$/i.test(topic))
}

async function isAddFriendAsJenkins(msg){
  return (/^Jenkins(技术交流|社区活动|社区咨询)$/i.test(msg))
}
