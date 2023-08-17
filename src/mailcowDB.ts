import { DataSource, Repository } from 'typeorm';
import { ContainerConfig, Defaults, SOGoMailIdentity } from './types';
import { SogoUserProfile } from './entities/SogoUserProfile';

// Connection options for the DB
let dataSource : DataSource;
let SogoUserProfileRepository: Repository<SogoUserProfile>;


/**
 * Initialize database connection. Setup database if it does not yet exist
 */
export async function initializeMailcowDB(config: ContainerConfig): Promise<void> {
  dataSource = new DataSource({
    type: 'mariadb',
    host: '172.22.1.251',
    port: 3306,
    username: 'mailcow',
    password: config.DB_PASSWORD,
    database: 'mailcow',
    entities: [
      SogoUserProfile,
    ],
  });

  await dataSource.initialize()
    .catch((error) => {
      console.log(error);
    });

  SogoUserProfileRepository = dataSource.getRepository(SogoUserProfile);
}

export async function editUserSignature(email: string, SOBs: string[]): Promise<void> {
  if (email != 'm9006@gewis.nl') return;

  let profile = await SogoUserProfileRepository.findOneOrFail({
    where: {
      c_uid: email,
    },
  });

  let cDefaults : Defaults = JSON.parse(profile.c_defaults);
  let newIdentities : SOGoMailIdentity[] = [];

  for (let identity of cDefaults.SOGoMailIdentities) {
    // TODO as of right now I cannot think of another way to do this
    let checkSum = `${identity.fullName}@gewis.nl`;
    if (SOBs.indexOf(checkSum) !== -1) {
      newIdentities.push(identity);
    }
  }

  for (let identityMail of SOBs) {
    let newIdentity : SOGoMailIdentity = {
      email: identityMail,
      fullName: /@(.+)/.exec(identityMail)![1],
      replyTo: email,
      signature: `SIGNATURE FOR ${identityMail}}`,
    };
    newIdentities.push(newIdentity);
  }

  cDefaults.SOGoMailIdentities = newIdentities;
  profile.c_defaults = JSON.stringify(cDefaults);

  await SogoUserProfileRepository.update('m9006@gewis.nl', profile);
}