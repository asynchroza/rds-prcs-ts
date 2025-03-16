import esbuild from 'esbuild';

async function build() {
    await esbuild.build({
        entryPoints: ['./src/index.ts'],
        bundle: true,
        outfile: './dist/bundle.js',
        target: 'ES2022',
        platform: 'node',
        minify: true,
        sourcemap: true,
        resolveExtensions: ['.ts', '.js'],
    });
}

build()
