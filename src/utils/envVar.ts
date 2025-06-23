import path from 'path';

interface EnvPath {

  path: string;


}

export const getRequiredEnvVar = (name: string): string => {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Required environment variable ${name} is missing`);
    }
    return value;
};



export const loadEnvPath = () : EnvPath => {
  const envFile = `.env.${process.env.NODE_ENV || 'development'}`;

  return {
    
    path:  path.resolve(process.cwd(), envFile)
  }
 

}